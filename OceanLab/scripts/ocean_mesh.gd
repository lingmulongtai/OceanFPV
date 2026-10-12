class_name OceanMesh extends MeshInstance3D
## Continuous concentric topology, dense near the viewer and sparse at the horizon.

func _init() -> void:
	name = "OceanSurface"
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	custom_aabb = AABB(Vector3(-40000, -100, -40000), Vector3(80000, 200, 80000))
	layers = 1
	var vertices := PackedVector3Array()
	var indices := PackedInt32Array()
	var segments := 192
	var rings := 80
	vertices.append(Vector3.ZERO)
	for ring in range(rings):
		var radius := 2.0 * (pow(1.097, float(ring + 1)) - 1.0) / 0.097
		for segment in segments:
			var angle := TAU * float(segment) / float(segments)
			vertices.append(Vector3(cos(angle) * radius, 0, sin(angle) * radius))
	for s in segments:
		indices.append_array(PackedInt32Array([0, 1 + (s + 1) % segments, 1 + s]))
	for r in range(rings - 1):
		for s in segments:
			var a := 1 + r * segments + s
			var b := 1 + r * segments + (s + 1) % segments
			var c := a + segments
			var d := b + segments
			indices.append_array(PackedInt32Array([a, b, c, b, d, c]))
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_INDEX] = indices
	var sea := ArrayMesh.new()
	sea.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh = sea
