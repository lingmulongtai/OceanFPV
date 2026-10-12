extends SceneTree
## Fixed orbit camera snapshots from the actual Godot renderer.

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	scene.hud.visible = false
	for _i in range(50): await process_frame
	if not scene.gpu.supported:
		push_error("Capture expected the GPU FFT renderer")
		quit(1)
		return
	await scene._capture()
	scene._set_time(1)
	for _i in range(20): await process_frame
	await scene._capture()
	scene.settings.set_sea(0)
	scene.settings.amplitude = 1.6
	scene._update_sea()
	for _i in range(30): await process_frame
	await scene._capture()
	print("CAPTURE_VIEWS_DONE")
	scene.queue_free()
	await process_frame
	quit()
