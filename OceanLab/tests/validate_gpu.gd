extends SceneTree
## Run with a real display and Forward+. Exercises actual GPU passes, not a CPU substitute.
var failures: Array[String] = []
var scene: Node3D
var readbacks := 0
var complete := false

func _initialize() -> void:
	ProjectSettings.set_setting("ocean/resolution", 128)
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition: failures.append(message)

func _run() -> void:
	scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	scene.gpu.heights_ready.connect(func(values: PackedFloat32Array):
		readbacks += 1
		check(values.size() == 27, "GPU readback must return 27 heights")
		for value in values: check(is_finite(value), "Non-finite GPU height"))
	for _i in range(30): await process_frame
	if not scene.gpu.supported:
		push_error("GPU backend did not initialize; this validation cannot pass via fallback")
		quit(1)
		return
	paused = true
	check(readbacks > 0, "Async buoyancy readback never completed")
	RenderingServer.call_on_render_thread(_validate_on_render_thread)
	while not complete: await process_frame
	paused = false
	print("GPU_VALIDATION ", "PASS" if failures.is_empty() else "FAIL", " async_readbacks=", readbacks)
	for failure in failures: push_error(failure)
	scene.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)

func _validate_on_render_thread() -> void:
	var ocean: GPUOcean = scene.gpu
	var rd := ocean.rd
	var n := ocean.config.resolution
	var measured_variance := 0.0
	for layer in range(5):
		var bytes := rd.texture_get_data(ocean.textures.displacements, layer)
		check(bytes.size() == n * n * 8, "Unexpected displacement format/size")
		if bytes.size() != n * n * 8: continue
		var image := Image.create_from_data(n, n, false, Image.FORMAT_RGBAH, bytes)
		var sum_height := 0.0
		var sum_squared := 0.0
		for y in range(n):
			for x in range(n):
				var p := image.get_pixel(x, y)
				check(is_finite(p.r) and is_finite(p.g) and is_finite(p.b), "Non-finite FFT output in cascade %d" % layer)
				sum_height += p.g
				sum_squared += p.g * p.g
		var mean := sum_height / float(n * n)
		var variance := sum_squared / float(n * n) - mean * mean
		print("CASCADE ", layer, " mean=", mean, " sigma=", sqrt(maxf(variance, 0.0)))
		check(absf(mean) < 0.01, "DC component is not zero")
		check(variance > 1e-10, "Cascade has no wave energy")
		measured_variance += variance
	check(measured_variance > 0.01 and measured_variance < 50, "Wave energy is outside a plausible range")
	# Independent known Fourier mode. A unit impulse in frequency space must be a unit sinusoid.
	var input := PackedByteArray()
	input.resize(5 * n * n * 64)
	input.fill(0)
	input.encode_float((5 * n + 2) * 8, 1.0)
	rd.buffer_update(ocean.buffers.fft, 0, input.size(), input)
	ocean._fft(0)
	ocean._dispatch(ocean.passes.transpose, Vector3i(n / 32, n / 32, 4), [0, n, 0, 0])
	ocean._fft(0)
	var transformed := rd.buffer_get_data(ocean.buffers.fft)
	for point in [Vector2i(0, 0), Vector2i(17, 23), Vector2i(71, 51), Vector2i(n - 1, n - 1)]:
		var offset: int = (n * n * 4 + point.y * n + point.x) * 8
		var angle := TAU * float(5 * point.x + 2 * point.y) / float(n)
		check(absf(transformed.decode_float(offset) - cos(angle)) < 0.0001, "FFT real component differs from analytic sinusoid")
		check(absf(transformed.decode_float(offset + 4) - sin(angle)) < 0.0001, "FFT imaginary component differs from analytic sinusoid")
	# Foam reproject: shift the clip by exactly one texel. The marker must stay at its world position.
	var size := ocean.config.foam_resolution
	var foam := Image.create(size, size, false, Image.FORMAT_RGBAH)
	foam.fill(Color(0, 0, 0, 0))
	foam.set_pixel(size / 2, size / 2, Color(0.6, 0.8, 0.2, 0.3))
	rd.texture_update(ocean.textures.foam0, 0, foam.get_data())
	var cell := 420.0 / float(size)
	ocean._dispatch(ocean.passes.foam0, Vector3i(size / 8, size / 8, 1), [cell, 0.0, 0.0, 0.0, 420.0, 0.0, 123.0, 0.0, 0, 0, 0, 1, 0.0, 0.0, 0.0, 0.0])
	var output := rd.texture_get_data(ocean.textures.foam1, 0)
	var projected := Image.create_from_data(size, size, false, Image.FORMAT_RGBAH, output)
	var marker := projected.get_pixel(size / 2 - 1, size / 2)
	check(absf(marker.r - 0.6) < 0.002 and absf(marker.a - 0.3) < 0.002, "Foam moved with the following clip instead of staying in world space")
	call_deferred("_finished")

func _finished() -> void:
	complete = true
