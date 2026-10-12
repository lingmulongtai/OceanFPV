extends SceneTree
## Integration checks the actual project scene and 27-point hydrostatic solver.

var failures: Array[String] = []

func _initialize() -> void:
	call_deferred("_run")

func check(condition: bool, message: String) -> void:
	if not condition: failures.append(message)

func _run() -> void:
	var packed: PackedScene = load("res://main.tscn")
	var scene = packed.instantiate()
	root.add_child(scene)
	await process_frame
	check(scene.ship.probes.size() == 27, "Expected 27 buoyancy probes")
	check(scene.cpu.waves.size() == 16, "CPU fallback should be explicitly available")
	check(not scene.gpu.supported, "Headless must not misreport GPU FFT as tested")
	check(scene.settings.resolution == 512, "High quality defaults to five 512² cascades")
	for index in range(3):
		scene.settings.set_sea(index)
		scene._update_sea()
		for p in [Vector2.ZERO, Vector2(-2131.7, 124.3), Vector2(18000, -9000)]:
			check(is_finite(scene.cpu.height_at(p, 142.5)), "Sea preset produced a non-finite height")
	# Hydrostatic equilibrium on a flat surface: stable draft, no roll/pitch drift.
	scene.settings.amplitude = 0.0
	scene._update_sea()
	scene.ship.throttle = 0
	scene.ship.linear_velocity = Vector3.ZERO
	scene.ship.angular_velocity = Vector3.ZERO
	scene.ship.global_position = Vector3(0, 0.3, 0)
	for _frame in range(480): await process_frame
	var y: float = scene.ship.global_position.y
	check(absf(y) < 0.15, "Flat-water hydrostatic equilibrium outside tolerance: y=%f" % y)
	check(absf(scene.ship.rotation.x) < 0.02 and absf(scene.ship.rotation.z) < 0.02, "Flat water introduced roll/pitch")
	check(scene.ship.water_heights.size() == 27, "Buoyancy heights lost a sample")
	var before: Vector3 = scene.ship.global_position
	paused = true
	for _frame in range(20): await process_frame
	check(scene.ship.global_position.distance_to(before) < 0.0001, "Pause did not freeze ship physics")
	paused = false
	print("HEADLESS_VALIDATION ", "PASS" if failures.is_empty() else "FAIL", " equilibrium_y=", y)
	for failure in failures: push_error(failure)
	scene.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)
