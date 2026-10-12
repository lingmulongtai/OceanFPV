extends SceneTree
func _initialize() -> void:
	call_deferred("_run")
func _run() -> void:
	var scene = load("res://main.tscn").instantiate()
	root.add_child(scene)
	for _i in range(8): await process_frame
	var ok: bool = not scene.gpu.supported and scene.status.text.begins_with("ANALYTIC PREVIEW")
	print("FALLBACK_VALIDATION ", "PASS" if ok else "FAIL")
	scene.queue_free()
	await process_frame
	quit(0 if ok else 1)
