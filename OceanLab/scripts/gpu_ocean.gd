class_name GPUOcean extends Node
## All RenderingDevice operations execute on the render thread.
## Textures stay on the GPU; only 27 buoyancy heights are read asynchronously.

signal textures_ready(textures: Dictionary)
signal textures_released
signal heights_ready(heights: PackedFloat32Array)
signal status_changed(message: String)

const CASCADES := 5
const QUERY_COUNT := 27
const HISTORY_COUNT := 128
const DEPTH := 1000.0

var config: OceanSettings
var supported := false
var initialized := false
var rd: RenderingDevice
var resources: Array[RID] = []
var textures: Dictionary = {}
var published_textures: Dictionary = {}
var buffers: Dictionary = {}
var passes: Dictionary = {}
var shader_cache: Dictionary = {}
var mip_passes: Array[Dictionary] = []
var foam_ping := 0
var query_pending := false
var previous_origins := [Vector2.ZERO, Vector2.ZERO]
var previous_parameters := PackedFloat32Array()

func _init(settings: OceanSettings) -> void:
	config = settings

func start() -> void:
	if DisplayServer.get_name() == "headless" or RenderingServer.get_current_rendering_method() == "gl_compatibility":
		status_changed.emit("ANALYTIC PREVIEW · Vulkan / Forward+ enables FFT")
		return
	RenderingServer.call_on_render_thread(_initialize_gpu)

func _track(rid: RID) -> RID:
	if not rid.is_valid(): push_error("GPU resource allocation failed")
	resources.append(rid)
	return rid

func _texture(size: int, layers: int, mips := 1, format := RenderingDevice.DATA_FORMAT_R16G16B16A16_SFLOAT) -> RID:
	var fmt := RDTextureFormat.new()
	fmt.width = size
	fmt.height = size
	fmt.array_layers = layers
	fmt.mipmaps = mips
	fmt.texture_type = RenderingDevice.TEXTURE_TYPE_2D_ARRAY
	fmt.format = format
	fmt.usage_bits = RenderingDevice.TEXTURE_USAGE_STORAGE_BIT | RenderingDevice.TEXTURE_USAGE_SAMPLING_BIT | RenderingDevice.TEXTURE_USAGE_CAN_COPY_FROM_BIT | RenderingDevice.TEXTURE_USAGE_CAN_UPDATE_BIT | RenderingDevice.TEXTURE_USAGE_CAN_COPY_TO_BIT
	var rid := _track(rd.texture_create(fmt, RDTextureView.new()))
	rd.texture_clear(rid, Color(0, 0, 0, 0), 0, mips, 0, layers)
	return rid

func _shader(file: String) -> RID:
	# Compile current source directly. A stale .comp import can never silently survive.
	if shader_cache.has(file): return shader_cache[file]
	var source := RDShaderSource.new()
	source.source_compute = FileAccess.get_file_as_string(file).replace("#[compute]", "")
	var spirv := rd.shader_compile_spirv_from_source(source)
	var error := spirv.get_stage_compile_error(RenderingDevice.SHADER_STAGE_COMPUTE)
	if not error.is_empty():
		push_error(file + "\n" + error)
		return RID()
	var rid := _track(rd.shader_create_from_spirv(spirv))
	shader_cache[file] = rid
	return rid

func _pass(file: String, descriptor_groups: Array) -> Dictionary:
	var shader := _shader(file)
	if not shader.is_valid(): return {}
	var sets: Array[RID] = []
	for set_index in descriptor_groups.size():
		var uniforms: Array[RDUniform] = []
		var group: Array = descriptor_groups[set_index]
		for binding in group.size():
			var u := RDUniform.new()
			u.binding = binding
			u.uniform_type = group[binding][0]
			u.add_id(group[binding][1])
			uniforms.append(u)
		sets.append(_track(rd.uniform_set_create(uniforms, shader, set_index)))
	return {"pipeline": _track(rd.compute_pipeline_create(shader)), "sets": sets}

func _image(rid: RID) -> Array:
	return [RenderingDevice.UNIFORM_TYPE_IMAGE, rid]

func _buffer(rid: RID) -> Array:
	return [RenderingDevice.UNIFORM_TYPE_STORAGE_BUFFER, rid]

static func constants(values: Array) -> PackedByteArray:
	var bytes := PackedByteArray()
	bytes.resize(ceili(values.size() / 4.0) * 16)
	bytes.fill(0)
	for i in values.size():
		if typeof(values[i]) == TYPE_FLOAT: bytes.encode_float(i * 4, values[i])
		else: bytes.encode_s32(i * 4, int(values[i]))
	return bytes

func _dispatch(pass_data: Dictionary, dims: Vector3i, values: Array = []) -> void:
	if pass_data.is_empty(): return
	# One compute list per dependent operation, including EVERY FFT stage.
	# Godot's render graph inserts the resource hazards between these lists.
	var list := rd.compute_list_begin()
	rd.compute_list_bind_compute_pipeline(list, pass_data.pipeline)
	for i in pass_data.sets.size(): rd.compute_list_bind_uniform_set(list, pass_data.sets[i], i)
	if not values.is_empty():
		var bytes := constants(values)
		rd.compute_list_set_push_constant(list, bytes, bytes.size())
	rd.compute_list_dispatch(list, dims.x, dims.y, dims.z)
	rd.compute_list_end()

func _initialize_gpu() -> void:
	rd = RenderingServer.get_rendering_device()
	if rd == null:
		call_deferred("_unavailable", "RenderingDevice unavailable")
		return
	var n := config.resolution
	var stages := int(log(n) / log(2))
	var mip_count := stages + 1
	textures.spectrum = _texture(n, CASCADES, 1, RenderingDevice.DATA_FORMAT_R32G32B32A32_SFLOAT)
	textures.displacements = _texture(n, CASCADES)
	textures.normals = _texture(n, CASCADES, mip_count)
	textures.moments = _texture(n, CASCADES, mip_count)
	textures.foam0 = _texture(config.foam_resolution, 2)
	textures.foam1 = _texture(config.foam_resolution, 2)
	textures.wake_a = _texture(config.foam_resolution, 2)
	textures.wake_b = _texture(config.foam_resolution, 2)
	buffers.factors = _track(rd.storage_buffer_create(stages * n * 16))
	buffers.fft = _track(rd.storage_buffer_create(CASCADES * n * n * 64))
	buffers.queries = _track(rd.storage_buffer_create(QUERY_COUNT * 16))
	buffers.history = _track(rd.storage_buffer_create(HISTORY_COUNT * 16))
	var dir := "res://assets/shaders/compute/"
	passes.spectrum = _pass(dir + "spectrum_compute.comp", [[_image(textures.spectrum)]])
	passes.butterfly = _pass(dir + "fft_butterfly.comp", [[_buffer(buffers.factors)]])
	passes.modulate = _pass(dir + "spectrum_modulate.comp", [[_image(textures.spectrum)], [_buffer(buffers.fft)]])
	passes.fft = _pass(dir + "fft_stage.comp", [[_buffer(buffers.factors), _buffer(buffers.fft)]])
	passes.transpose = _pass(dir + "transpose_stage.comp", [[_buffer(buffers.fft)]])
	passes.unpack = _pass(dir + "fft_unpack.comp", [[_image(textures.displacements), _image(textures.normals), _image(textures.moments)], [_buffer(buffers.fft)]])
	passes.queries = _pass(dir + "sample_heights.comp", [[_image(textures.displacements), _buffer(buffers.queries)]])
	for ping in range(2):
		passes["foam%d" % ping] = _pass(dir + "foam_wake.comp", [[
			_image(textures["foam%d" % ping]), _image(textures["foam%d" % (1 - ping)]),
			_image(textures.normals), _image(textures.wake_a), _image(textures.wake_b), _buffer(buffers.history)]])
	for mip in range(1, mip_count):
		for layer in CASCADES:
			var views: Array[RID] = []
			for texture_name in ["normals", "moments"]:
				for level in [mip - 1, mip]:
					views.append(_track(rd.texture_create_shared_from_slice(RDTextureView.new(), textures[texture_name], layer, level, 1, RenderingDevice.TEXTURE_SLICE_2D)))
			mip_passes.append({"width": n >> mip, "pass": _pass(dir + "mipmap.comp", [[_image(views[0]), _image(views[1]), _image(views[2]), _image(views[3])]])})
	for pass_data in passes.values():
		if pass_data.is_empty():
			call_deferred("_unavailable", "Compute shader failed; see Output")
			return
	_dispatch(passes.butterfly, Vector3i(n / 128, stages, 1))
	call_deferred("_publish_textures")

func _publish_textures() -> void:
	var public_textures := {}
	for key in textures:
		if key == "spectrum": continue
		var tex := Texture2DArrayRD.new()
		tex.texture_rd_rid = textures[key]
		public_textures[key] = tex
	published_textures = public_textures
	supported = true
	initialized = true
	textures_ready.emit(public_textures)
	status_changed.emit("GPU FFT · 5 × %d² · JONSWAP + swell" % config.resolution)
	print("GPU_FFT_READY resolution=%d cascades=5" % config.resolution)

func _unavailable(message: String) -> void:
	supported = false
	status_changed.emit(message)

func step(dt: float, time: float, ship_position: Vector3, queries: PackedVector3Array, history: PackedVector4Array) -> void:
	if not initialized: return
	var values := PackedFloat32Array([config.wind_speed, deg_to_rad(config.wind_direction), config.fetch_km * 1000.0,
		config.swell_height, TAU / config.swell_period, deg_to_rad(config.swell_direction), config.amplitude, config.chop])
	RenderingServer.call_on_render_thread(_render_step.bind(dt, time, Vector2(ship_position.x, ship_position.z), queries, history, values, config.wake_enabled, config.foam_enabled))

func _fft(cascade: int) -> void:
	var n := config.resolution
	var stages := int(log(n) / log(2))
	for stage in stages:
		_dispatch(passes.fft, Vector3i(n / 64, n, 4), [cascade, n, stage, 0])
	if stages % 2 == 0:
		_dispatch(passes.fft, Vector3i(n / 64, n, 4), [cascade, n, 0, 1])

func _render_step(dt: float, time: float, position: Vector2, queries: PackedVector3Array, history: PackedVector4Array, v: PackedFloat32Array, wake_on: bool, foam_on: bool) -> void:
	var n := config.resolution
	var dims := Vector3i(n / 16, n / 16, 1)
	if previous_parameters != v:
		var alpha := 0.076 * pow(v[0] * v[0] / (v[2] * 9.81), 0.22)
		var peak := 22.0 * pow(9.81 * 9.81 / (v[0] * v[2]), 1.0 / 3.0)
		for i in CASCADES:
			var length_m: float = OceanSettings.LENGTHS[i]
			var min_wavelength := maxf(OceanSettings.BAND_MIN[i], length_m * 4.0 / float(n))
			_dispatch(passes.spectrum, dims, [117 + i * 313, 241 + i * 197, length_m, length_m,
				alpha, peak, v[0], v[1], DEPTH, 0.0, 1.0, 0.18, i,
				TAU / OceanSettings.BAND_MAX[i], TAU / min_wavelength, v[3], v[4], v[5]])
		previous_parameters = v
	for i in CASCADES:
		var length_m: float = OceanSettings.LENGTHS[i]
		_dispatch(passes.modulate, dims, [length_m, length_m, DEPTH, time, i, v[7]])
		_fft(i)
		_dispatch(passes.transpose, Vector3i(n / 32, n / 32, 4), [i, n, 0, 0])
		_fft(i)
		_dispatch(passes.unpack, dims, [i, 0.56, 0.0, 0.0, v[6]])
	# Mip moments E[s], E[s²] before using their variance in the water shader.
	for mip in mip_passes:
		var width: int = mip.width
		_dispatch(mip.pass, Vector3i(ceili(width / 8.0), ceili(width / 8.0), 1), [width, 1, 0, 0])
	var history_bytes := PackedByteArray()
	history_bytes.resize(HISTORY_COUNT * 16)
	history_bytes.fill(0)
	var count := mini(history.size(), HISTORY_COUNT)
	for i in count:
		var p := history[i]
		for j in range(4): history_bytes.encode_float(i * 16 + j * 4, p[j])
	rd.buffer_update(buffers.history, 0, history_bytes.size(), history_bytes)
	var coverage := clampf(3.84e-6 * pow(v[0], 3.41), 0.0, 1.0)
	for clip in range(2):
		var length_m: float = OceanSettings.FOAM_LENGTHS[clip]
		var cell := length_m / float(config.foam_resolution)
		var origin := position.snapped(Vector2(cell, cell))
		var old_origin: Vector2 = previous_origins[clip]
		_dispatch(passes["foam%d" % foam_ping], Vector3i(config.foam_resolution / 8, config.foam_resolution / 8, 1),
			[origin.x, origin.y, old_origin.x, old_origin.y, length_m, dt, time, v[0], clip, count,
			int(wake_on), int(foam_on), cos(v[1]), sin(v[1]), coverage, 0.0])
		previous_origins[clip] = origin
	foam_ping = 1 - foam_ping
	call_deferred("_publish_foam", foam_ping, previous_origins.duplicate())
	if queries.size() == QUERY_COUNT and not query_pending:
		query_pending = true
		var bytes := PackedByteArray()
		bytes.resize(QUERY_COUNT * 16)
		for i in QUERY_COUNT:
			bytes.encode_float(i * 16, queries[i].x)
			bytes.encode_float(i * 16 + 4, queries[i].y)
			bytes.encode_float(i * 16 + 8, queries[i].z)
			bytes.encode_float(i * 16 + 12, 0.0)
		rd.buffer_update(buffers.queries, 0, bytes.size(), bytes)
		_dispatch(passes.queries, Vector3i(1, 1, 1), [v[6], QUERY_COUNT, 0, 0])
		rd.buffer_get_data_async(buffers.queries, _readback)

signal foam_updated(ping: int, origins: Array)

func _publish_foam(ping: int, origins: Array) -> void:
	foam_updated.emit(ping, origins)

func _readback(bytes: PackedByteArray) -> void:
	var heights := PackedFloat32Array()
	for i in QUERY_COUNT:
		var value := bytes.decode_float(i * 16 + 4)
		heights.append(value if is_finite(value) else 0.0)
	query_pending = false
	call_deferred("_publish_heights", heights)

func _publish_heights(values: PackedFloat32Array) -> void:
	heights_ready.emit(values)

func _exit_tree() -> void:
	supported = false
	initialized = false
	textures_released.emit()
	for tex in published_textures.values(): tex.texture_rd_rid = RID()
	published_textures.clear()
	if rd != null: RenderingServer.call_on_render_thread(_release)

func _release() -> void:
	for i in range(resources.size() - 1, -1, -1):
		if resources[i].is_valid(): rd.free_rid(resources[i])
	resources.clear()
