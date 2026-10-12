class_name WakeRibbons extends MeshInstance3D
var ocean_material: ShaderMaterial

func _init() -> void:
	name = "AnalyticKelvinRibbons"
	layers = 4
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	ocean_material = ShaderMaterial.new()
	ocean_material.shader = load("res://assets/shaders/wake_ribbon.gdshader")
	material_override = ocean_material

func update_path(history: PackedVector4Array, speed: float) -> void:
	if history.size() < 3 or speed < 0.5:
		visible = false
		return
	visible = true
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for side in [-1.0, 1.0]:
		var vertices := PackedVector3Array()
		var age_weights := PackedFloat32Array()
		var distance_aft := 0.0
		for i in history.size():
			var p := history[i]
			if i > 0: distance_aft += Vector2(p.x, p.y).distance_to(Vector2(history[i - 1].x, history[i - 1].y))
			var tangent: Vector2 = Vector2(cos(p.w), -sin(p.w)) * side
			var width := 1.2 + distance_aft * 0.014
			var center: Vector2 = Vector2(p.x, p.y) + tangent * distance_aft * 0.35355339
			for sign_value in [-1.0, 1.0]:
				var v: Vector2 = center + tangent * width * sign_value
				vertices.append(Vector3(v.x, 0, v.y))
				age_weights.append(exp(-distance_aft / 1000.0))
		for i in range(history.size() - 1):
			for index in [i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2]:
				st.set_color(Color(1, 1, 1, age_weights[index]))
				st.set_uv(Vector2(float(index % 2), float(index / 2) / float(history.size())))
				st.add_vertex(vertices[index])
	mesh = st.commit()
