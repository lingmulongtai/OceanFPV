extends Node3D

var settings := OceanSettings.new()
var cpu: CPUSea
var gpu: GPUOcean
var ship: OceanShip
var ocean: OceanMesh
var wake: WakeRibbons
var sea_material: ShaderMaterial
var sky_material: ShaderMaterial
var environment: WorldEnvironment
var sun: DirectionalLight3D
var camera: Camera3D
var reflection_camera: Camera3D
var reflection_view: SubViewport
var hud: CanvasLayer
var sidebar: PanelContainer
var stats: Label
var status: Label
var pause_label: Label
var noise_texture: NoiseTexture3D
var simulation_time := 120.0
var orbit_angle := 0.72
var orbit_elevation := 0.16
var camera_distance := 158.0
var frame := 0
var sea_buttons: Array[Button] = []
var sky_buttons: Array[Button] = []
var ambience: AudioStreamPlayer
var capture_at := -1

func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS
	settings.resolution = int(ProjectSettings.get_setting("ocean/resolution", 512))
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--fft="): settings.resolution = int(arg.trim_prefix("--fft="))
		if arg == "--sunset": settings.time_preset = 1
		if arg.begins_with("--sea="): settings.set_sea(clampi(int(arg.trim_prefix("--sea=")), 0, 2))
		if arg.begins_with("--capture-frame="): capture_at = int(arg.trim_prefix("--capture-frame="))
	if settings.resolution not in [128, 256, 512]: settings.resolution = 512
	cpu = CPUSea.new(settings)
	_build_world()
	_build_ui()
	gpu = GPUOcean.new(settings)
	gpu.name = "SpectralSimulation"
	add_child(gpu)
	gpu.textures_ready.connect(_textures_ready)
	gpu.textures_released.connect(_textures_released)
	gpu.heights_ready.connect(ship.set_heights)
	gpu.foam_updated.connect(_foam_updated)
	gpu.status_changed.connect(func(message: String): status.text = message)
	gpu.start()
	_update_sea()
	_set_time(settings.time_preset)
	if "--no-ui" in OS.get_cmdline_user_args(): hud.visible = false
	_update_camera(1.0)
	print("OCEAN_LAB_READY resolution=%d probes=%d renderer=%s" % [settings.resolution, ship.probes.size(), RenderingServer.get_current_rendering_method()])

func _build_world() -> void:
	var noise := FastNoiseLite.new()
	noise.seed = 2401
	noise.frequency = 0.035
	noise.fractal_octaves = 4
	noise_texture = NoiseTexture3D.new()
	noise_texture.width = 64
	noise_texture.height = 64
	noise_texture.depth = 64
	noise_texture.seamless = true
	noise_texture.noise = noise
	sky_material = ShaderMaterial.new()
	sky_material.shader = load("res://assets/shaders/sky.gdshader")
	sky_material.set_shader_parameter("cloud_noise", noise_texture)
	var sky := Sky.new()
	sky.sky_material = sky_material
	sky.process_mode = Sky.PROCESS_MODE_REALTIME
	sky.radiance_size = Sky.RADIANCE_SIZE_256
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.ambient_light_energy = 0.8
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 1.0
	env.fog_enabled = true
	env.fog_light_color = Color(0.65, 0.74, 0.8)
	env.fog_density = 0.00008
	env.fog_sky_affect = 0.0
	if RenderingServer.get_current_rendering_method() == "forward_plus":
		env.glow_enabled = true
		env.glow_intensity = 0.13
		env.ssao_enabled = true
		env.ssao_radius = 1.5
		env.ssao_intensity = 0.65
	environment = WorldEnvironment.new()
	environment.environment = env
	add_child(environment)
	sun = DirectionalLight3D.new()
	sun.name = "CalibratedSun"
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 500
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	add_child(sun)
	ocean = OceanMesh.new()
	sea_material = ShaderMaterial.new()
	sea_material.shader = load("res://assets/shaders/ocean.gdshader")
	sea_material.set_shader_parameter("cloud_noise", noise_texture)
	sea_material.set_shader_parameter("absorption", OceanSettings.WATER_ABSORPTION)
	sea_material.set_shader_parameter("backscatter", OceanSettings.WATER_BACKSCATTER)
	ocean.material_override = sea_material
	add_child(ocean)
	ship = OceanShip.new(settings)
	ship.process_mode = Node.PROCESS_MODE_PAUSABLE
	add_child(ship)
	ship.linear_velocity = Vector3(0, 0, -12)
	ship.set_heights(cpu.heights(ship.query_points(), simulation_time))
	wake = WakeRibbons.new()
	add_child(wake)
	camera = Camera3D.new()
	camera.name = "OrbitCamera"
	camera.fov = 55
	camera.near = 0.15
	camera.far = 24000
	add_child(camera)
	camera.current = true
	if DisplayServer.get_name() != "headless":
		reflection_view = SubViewport.new()
		reflection_view.name = "PlanarShipReflection"
		reflection_view.size = Vector2i(640, 360)
		reflection_view.world_3d = get_world_3d()
		reflection_view.transparent_bg = true
		reflection_view.render_target_update_mode = SubViewport.UPDATE_ALWAYS
		add_child(reflection_view)
		reflection_camera = Camera3D.new()
		reflection_camera.cull_mask = 2
		reflection_camera.fov = camera.fov
		reflection_camera.far = camera.far
		reflection_view.add_child(reflection_camera)
		reflection_camera.current = true
		sea_material.set_shader_parameter("planar_reflection", reflection_view.get_texture())
		sea_material.set_shader_parameter("planar_enabled", true)
	if DisplayServer.get_name() != "headless" and AudioServer.get_driver_name() != "Dummy" and ResourceLoader.exists("res://assets/ocean_ambience.wav"):
		ambience = AudioStreamPlayer.new()
		ambience.stream = load("res://assets/ocean_ambience.wav")
		if ambience.stream is AudioStreamWAV:
			ambience.stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
			ambience.stream.loop_end = int(ambience.stream.get_length() * ambience.stream.mix_rate)
		ambience.volume_db = -18
		add_child(ambience)
		ambience.play()

func _textures_ready(textures: Dictionary) -> void:
	for key in textures: sea_material.set_shader_parameter(key, textures[key])
	sea_material.set_shader_parameter("use_fft", true)
	wake.ocean_material.set_shader_parameter("use_fft", true)
	wake.ocean_material.set_shader_parameter("displacements", textures.displacements)

func _textures_released() -> void:
	sea_material.set_shader_parameter("use_fft", false)
	wake.ocean_material.set_shader_parameter("use_fft", false)
	for key in ["displacements", "normals", "moments", "foam0", "foam1", "wake_a", "wake_b"]:
		sea_material.set_shader_parameter(key, null)
	wake.ocean_material.set_shader_parameter("displacements", null)

func _foam_updated(ping: int, origins: Array) -> void:
	sea_material.set_shader_parameter("foam_ping", ping)
	sea_material.set_shader_parameter("foam_origin0", origins[0])
	sea_material.set_shader_parameter("foam_origin1", origins[1])

func _process(delta: float) -> void:
	if ship == null: return
	var dt := minf(delta, 0.05)
	if not get_tree().paused:
		simulation_time += dt
		if not gpu.supported: ship.set_heights(cpu.heights(ship.query_points(), simulation_time))
		ship.update_effects(dt, simulation_time)
		gpu.step(dt, simulation_time, ship.global_position, ship.query_points(), ship.wake_history())
		if frame % 3 == 0:
			wake.update_path(ship.wake_history(), ship.speed)
			wake.visible = settings.wake_enabled and wake.visible
	_update_camera(delta)
	for mat in [sea_material, sky_material, wake.ocean_material]: mat.set_shader_parameter("simulation_time", simulation_time)
	sea_material.set_shader_parameter("ship_position", ship.global_position)
	sea_material.set_shader_parameter("ship_forward", Vector2(-ship.global_basis.z.x, -ship.global_basis.z.z))
	sea_material.set_shader_parameter("ship_speed", ship.speed)
	if frame % 15 == 0:
		stats.text = "風速  %.0f m/s     船速  %.1f kn     波の増幅  ×%.1f\n白波の基準被覆率  %.2f%%     %d FPS" % [settings.wind_speed, maxf(ship.speed, 0.0) * 1.94384, settings.amplitude, settings.whitecap_fraction() * 100.0, Engine.get_frames_per_second()]
	frame += 1
	if frame == capture_at: _capture()

func _update_camera(delta: float) -> void:
	var offset := Vector3(sin(orbit_angle) * cos(orbit_elevation), sin(orbit_elevation), cos(orbit_angle) * cos(orbit_elevation)) * camera_distance
	var target := ship.global_position + Vector3.UP * 3.0
	camera.global_position = camera.global_position.lerp(target + offset, 1.0 - exp(-delta * 5.0))
	camera.look_at(target)
	ocean.global_position = Vector3(camera.global_position.x, 0, camera.global_position.z).snapped(Vector3(8, 1, 8))
	if reflection_camera:
		reflection_camera.global_position = camera.global_position * Vector3(1, -1, 1)
		reflection_camera.look_at(target * Vector3(1, -1, 1), Vector3.DOWN)
		sea_material.set_shader_parameter("planar_matrix", reflection_camera.get_camera_projection() * Projection(reflection_camera.global_transform.affine_inverse()))

func _update_sea() -> void:
	cpu.rebuild()
	for material in [sea_material, wake.ocean_material]:
		material.set_shader_parameter("map_scales", settings.scales())
		material.set_shader_parameter("analytic_waves", cpu.waves)
		material.set_shader_parameter("analytic_frequencies", cpu.frequencies)
	sea_material.set_shader_parameter("foam_enabled", settings.foam_enabled)
	sea_material.set_shader_parameter("wake_enabled", settings.wake_enabled)
	for i in sea_buttons.size(): sea_buttons[i].button_pressed = i == settings.sea_preset

func _set_time(index: int) -> void:
	settings.time_preset = index
	var direction := Vector3(-0.45, 0.42, -0.72).normalized() if index == 0 else Vector3(-0.58, 0.095, -0.81).normalized()
	var color := Color(1, 0.93, 0.79) if index == 0 else Color(1, 0.65, 0.34)
	var energy := 4.0 if index == 0 else 2.3
	sun.look_at(-direction)
	sun.light_color = color
	sun.light_energy = energy
	for mat in [sky_material, sea_material]:
		mat.set_shader_parameter("sun_direction", direction)
		mat.set_shader_parameter("sun_color", color)
		mat.set_shader_parameter("sun_energy", energy)
		mat.set_shader_parameter("dusk", float(index))
	for mat in ship.spray_materials:
		mat.set_shader_parameter("sun_direction", direction)
		mat.set_shader_parameter("sun_color", color)
	for i in sky_buttons.size(): sky_buttons[i].button_pressed = i == index

func _panel_style() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.018, 0.042, 0.059, 0.83)
	box.border_color = Color(0.63, 0.80, 0.86, 0.15)
	box.set_border_width_all(1)
	box.set_corner_radius_all(12)
	box.content_margin_left = 20
	box.content_margin_right = 20
	box.content_margin_top = 16
	box.content_margin_bottom = 16
	return box

func _label(text_value: String, size := 14, color := Color(0.72, 0.84, 0.88)) -> Label:
	var node := Label.new()
	node.text = text_value
	node.add_theme_font_size_override("font_size", size)
	node.add_theme_color_override("font_color", color)
	return node

func _buttons(parent: VBoxContainer, labels: Array, callback: Callable) -> Array[Button]:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	parent.add_child(row)
	var result: Array[Button] = []
	for i in labels.size():
		var button := Button.new()
		button.text = labels[i]
		button.toggle_mode = true
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		button.custom_minimum_size.y = 34
		button.pressed.connect(callback.bind(i))
		row.add_child(button)
		result.append(button)
	return result

func _build_ui() -> void:
	hud = CanvasLayer.new()
	hud.name = "OceanControls"
	add_child(hud)
	var root := Control.new()
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud.add_child(root)
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Noto Sans CJK JP", "Noto Sans", "sans-serif"])
	theme.default_font = font
	theme.default_font_size = 13
	root.theme = theme
	var title := _label("O C E A N   L A B", 24, Color(0.92, 0.96, 0.97))
	title.position = Vector2(30, 22)
	root.add_child(title)
	var subtitle := _label("波、光、泡。海をつくる実験室。", 13)
	subtitle.position = Vector2(32, 56)
	root.add_child(subtitle)
	sidebar = PanelContainer.new()
	sidebar.name = "SettingsPanel"
	sidebar.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	sidebar.position = Vector2(-320, 24)
	sidebar.custom_minimum_size = Vector2(292, 0)
	sidebar.add_theme_stylebox_override("panel", _panel_style())
	root.add_child(sidebar)
	var controls := VBoxContainer.new()
	controls.add_theme_constant_override("separation", 12)
	sidebar.add_child(controls)
	controls.add_child(_label("SEA CONDITIONS", 12))
	sea_buttons = _buttons(controls, ["穏やか", "通常", "荒天"], func(i: int): settings.set_sea(i); _update_sea())
	controls.add_child(_label("LIGHT", 12))
	sky_buttons = _buttons(controls, ["昼の海", "夕暮れ"], _set_time)
	controls.add_child(_label("波の増幅  /  1.0 = 基準スペクトル", 12))
	var gain := HSlider.new()
	gain.name = "AmplitudeSlider"
	gain.min_value = 1.0
	gain.max_value = 3.5
	gain.step = 0.1
	gain.value = settings.amplitude
	gain.value_changed.connect(func(value: float): settings.amplitude = value; _update_sea())
	controls.add_child(gain)
	for label_text in ["白波と泡", "航跡", "しぶき", "雲"]:
		var check := CheckButton.new()
		check.text = label_text
		check.button_pressed = true
		check.toggled.connect(_toggle_effect.bind(label_text))
		controls.add_child(check)
	controls.add_child(_label("FFT QUALITY", 12))
	var quality := OptionButton.new()
	quality.add_item("軽量  ·  5 × 128²", 128)
	quality.add_item("標準  ·  5 × 256²", 256)
	quality.add_item("高品質  ·  5 × 512²", 512)
	quality.select([128, 256, 512].find(settings.resolution))
	quality.item_selected.connect(func(i: int): ProjectSettings.set_setting("ocean/resolution", quality.get_item_id(i)); get_tree().reload_current_scene())
	controls.add_child(quality)
	controls.add_child(_label("右ドラッグ：視点   ホイール：距離\nW / S：船速   A / D：舵\n1〜4：カメラ   Space：一時停止\nTab：UI   F1：診断表示   F12：撮影", 12))
	var bar := PanelContainer.new()
	bar.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	bar.position = Vector2(28, -120)
	bar.custom_minimum_size = Vector2(620, 92)
	bar.add_theme_stylebox_override("panel", _panel_style())
	root.add_child(bar)
	var info := VBoxContainer.new()
	bar.add_child(info)
	stats = _label("", 14, Color(0.9, 0.95, 0.96))
	status = _label("INITIALIZING OCEAN…", 11)
	info.add_child(stats)
	info.add_child(status)
	pause_label = _label("PAUSED", 22, Color(0.95, 0.88, 0.67))
	pause_label.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	pause_label.position = Vector2(-48, 24)
	pause_label.visible = false
	root.add_child(pause_label)

func _toggle_effect(on: bool, label_text: String) -> void:
	match label_text:
		"白波と泡": settings.foam_enabled = on
		"航跡": settings.wake_enabled = on
		"しぶき": settings.spray_enabled = on
		"雲":
			for mat in [sea_material, sky_material]: mat.set_shader_parameter("clouds_enabled", on)
	_update_sea()

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		orbit_angle -= event.relative.x * 0.006
		orbit_elevation = clampf(orbit_elevation + event.relative.y * 0.004, 0.025, 1.15)
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP: camera_distance = maxf(22, camera_distance * 0.91)
		if event.button_index == MOUSE_BUTTON_WHEEL_DOWN: camera_distance = minf(1600, camera_distance * 1.1)
	if event is InputEventKey and event.pressed and not event.echo:
		match event.keycode:
			KEY_SPACE:
				get_tree().paused = not get_tree().paused
				pause_label.visible = get_tree().paused
			KEY_TAB: hud.visible = not hud.visible
			KEY_F1: sea_material.set_shader_parameter("debug_view", (int(sea_material.get_shader_parameter("debug_view")) + 1) % 6)
			KEY_F12: _capture()
			KEY_M:
				if ambience: ambience.stream_paused = not ambience.stream_paused
			KEY_1: orbit_angle = 0.72; orbit_elevation = 0.16; camera_distance = 158
			KEY_2: orbit_angle = 2.55; orbit_elevation = 0.12; camera_distance = 98
			KEY_3: orbit_angle = 0.85; orbit_elevation = 0.48; camera_distance = 460
			KEY_4: orbit_angle = 1.10; orbit_elevation = 0.025; camera_distance = 128
			KEY_ESCAPE: get_tree().quit()

func _capture() -> void:
	if DisplayServer.get_name() == "headless": return
	await RenderingServer.frame_post_draw
	var image := get_viewport().get_texture().get_image()
	var directory := "res://captures"
	DirAccess.make_dir_recursive_absolute(directory)
	var file := "%s/ocean_%d_sea%d_%d_%03d.png" % [directory, settings.time_preset, settings.sea_preset, settings.resolution, frame]
	var error := image.save_png(file)
	if error == OK: status.text = "CAPTURE SAVED · " + file

func _exit_tree() -> void:
	if ambience:
		ambience.stop()
		ambience.stream = null
