class_name OceanShip extends RigidBody3D
## Original procedural destroyer-shaped test vessel; this is NOT the ASSOC. Kikuzuki asset.

const PROBE_COUNT := 27
const WATER_DENSITY := 1025.0
const DRAFT := 1.8
const MASS := 1000000.0

var probes := PackedVector3Array()
var water_heights := PackedFloat32Array()
var history := PackedVector4Array()
var throttle := 12.0
var steering := 0.0
var time := 0.0
var history_time := -10.0
var speed := 0.0
var settings: OceanSettings
var spray_nodes: Array[GPUParticles3D] = []
var spray_materials: Array[ShaderMaterial] = []
var spray_processes: Array[ShaderMaterial] = []
var water_vertical_speed := 0.0
var previous_bow_height := 0.0
var impact := 0.0
var radar: Node3D

func _init(config: OceanSettings) -> void:
	settings = config
	mass = MASS
	linear_damp = 0.02
	angular_damp = 1.6
	can_sleep = false
	name = "ProceduralDestroyer"
	for z in range(9):
		for x in range(3): probes.append(Vector3(float(x - 1) * 3.0, -DRAFT, float(z - 4) * 9.4))
	water_heights.resize(PROBE_COUNT)
	water_heights.fill(0)

func _ready() -> void:
	var shape := BoxShape3D.new()
	shape.size = Vector3(8.8, 4.0, 92.0)
	var collision := CollisionShape3D.new()
	collision.shape = shape
	add_child(collision)
	_build_model()
	_create_spray()

func query_points() -> PackedVector3Array:
	var points := PackedVector3Array()
	for p in probes: points.append(global_transform * p)
	return points

func set_heights(values: PackedFloat32Array) -> void:
	if values.size() == PROBE_COUNT: water_heights = values

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	if water_heights.size() != PROBE_COUNT: return
	# Area chosen so rho*A*draft = mass. It is a hydrostatic proxy, not a hull CFD solver.
	var patch_area := MASS / (WATER_DENSITY * DRAFT * float(PROBE_COUNT))
	var stiffness := WATER_DENSITY * 9.81 * patch_area
	for i in PROBE_COUNT:
		var radius := state.transform.basis * probes[i]
		var world := state.transform.origin + radius
		var submerged := clampf(water_heights[i] - world.y, 0.0, 4.5)
		var point_velocity := state.linear_velocity + state.angular_velocity.cross(radius)
		var lift := maxf(0.0, stiffness * submerged - point_velocity.y * 18000.0)
		state.apply_force(Vector3.UP * lift, radius)
	var forward := -state.transform.basis.z
	forward.y = 0
	forward = forward.normalized()
	var lateral := state.transform.basis.x
	speed = state.linear_velocity.dot(forward)
	state.apply_central_force(forward * (throttle - speed) * MASS / 6.0)
	state.apply_central_force(-lateral * state.linear_velocity.dot(lateral) * MASS / 2.0)
	state.apply_torque(Vector3.UP * steering * MASS * 120.0)

func update_effects(dt: float, simulation_time: float) -> void:
	time = simulation_time
	if Input.is_key_pressed(KEY_W): throttle = minf(18.0, throttle + dt * 3.0)
	if Input.is_key_pressed(KEY_S): throttle = maxf(0.0, throttle - dt * 3.0)
	steering = float(Input.is_key_pressed(KEY_A)) - float(Input.is_key_pressed(KEY_D))
	var bow_height := (water_heights[0] + water_heights[1] + water_heights[2]) / 3.0
	water_vertical_speed = lerpf(water_vertical_speed, (bow_height - previous_bow_height) / maxf(dt, 0.001), 0.15)
	previous_bow_height = bow_height
	# Slamming = water up relative to bow, with bow near/under the local surface.
	var bow_radius := global_basis * probes[1]
	var bow_velocity := linear_velocity + angular_velocity.cross(bow_radius)
	var relative_speed := water_vertical_speed - bow_velocity.y
	var submerged := bow_height - (global_position.y + bow_radius.y)
	impact = lerpf(impact, clampf(relative_speed - 1.2, 0.0, 6.0) * smoothstep(0.8, 2.2, submerged), 0.25)
	for i in spray_nodes.size():
		spray_nodes[i].emitting = settings.spray_enabled and speed > 1.0
		spray_nodes[i].amount_ratio = clampf(speed / 18.0 + impact * 0.09, 0.05, 1.0)
		spray_processes[i].set_shader_parameter("ship_speed", speed)
		spray_processes[i].set_shader_parameter("impact", impact)
		var wind_angle := deg_to_rad(settings.wind_direction)
		spray_processes[i].set_shader_parameter("wind", Vector3(cos(wind_angle), 0, sin(wind_angle)) * settings.wind_speed * 0.4)
	if radar: radar.rotation.y += dt * 0.7
	if time - history_time >= 1.7:
		history.insert(0, Vector4(global_position.x, global_position.z, time, rotation.y))
		if history.size() > 127: history.resize(127)
		history_time = time

func wake_history() -> PackedVector4Array:
	var result := PackedVector4Array([Vector4(global_position.x, global_position.z, time, rotation.y)])
	result.append_array(history)
	return result

func _standard(color: Color, roughness := 0.65) -> StandardMaterial3D:
	var mat := StandardMaterial3D.new()
	mat.albedo_color = color
	mat.roughness = roughness
	mat.metallic = 0.30
	return mat

func _part(part_name: String, part_mesh: Mesh, pos: Vector3, material: Material, parent: Node3D = self) -> MeshInstance3D:
	var node := MeshInstance3D.new()
	node.name = part_name
	node.mesh = part_mesh
	node.position = pos
	node.material_override = material
	node.layers = 2
	parent.add_child(node)
	return node

func _box(part_name: String, size: Vector3, pos: Vector3, material: Material, parent: Node3D = self) -> MeshInstance3D:
	var box := BoxMesh.new()
	box.size = size
	return _part(part_name, box, pos, material, parent)

func _cylinder(part_name: String, radius: float, height: float, pos: Vector3, material: Material, parent: Node3D = self) -> MeshInstance3D:
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = radius
	cylinder.bottom_radius = radius
	cylinder.height = height
	cylinder.radial_segments = 20
	return _part(part_name, cylinder, pos, material, parent)

func _hull_mesh() -> ArrayMesh:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sections: Array[PackedVector3Array] = []
	for i in range(33):
		var z := -46.0 + float(i) * 92.0 / 32.0
		var u := float(i) / 32.0
		var width := 4.4 * pow(maxf(sin(PI * u), 0.012), 0.42)
		var sheer := 0.75 * pow(1.0 - u, 4.0)
		sections.append(PackedVector3Array([Vector3(-width, 1.6 + sheer, z), Vector3(width, 1.6 + sheer, z),
			Vector3(width * 0.83, -1.7, z), Vector3(width * 0.48, -2.7, z),
			Vector3(-width * 0.48, -2.7, z), Vector3(-width * 0.83, -1.7, z)]))
	for i in range(32):
		for j in range(6):
			var next := (j + 1) % 6
			for p in [sections[i][j], sections[i + 1][j], sections[i][next],
				sections[i][next], sections[i + 1][j], sections[i + 1][next]]: st.add_vertex(p)
	for end in [0, 32]:
		for j in range(1, 5):
			var triangle := [sections[end][0], sections[end][j], sections[end][j + 1]]
			if end == 32: triangle.reverse()
			for p in triangle: st.add_vertex(p)
	st.generate_normals()
	return st.commit()

func _build_model() -> void:
	var paint := _standard(Color(0.27, 0.31, 0.33))
	var dark := _standard(Color(0.08, 0.10, 0.115))
	var deck := _standard(Color(0.32, 0.29, 0.25), 0.84)
	var windows := _standard(Color(0.04, 0.085, 0.10), 0.20)
	var hull_mat := ShaderMaterial.new()
	hull_mat.shader = load("res://assets/shaders/hull.gdshader")
	_part("HullWithWetWaterline", _hull_mesh(), Vector3.ZERO, hull_mat)
	_box("ForecastleDeck", Vector3(5.5, 0.16, 29), Vector3(0, 1.73, -23), deck)
	_box("AftDeck", Vector3(6.3, 0.16, 31), Vector3(0, 1.7, 23), deck)
	_box("BridgeLower", Vector3(5.8, 3.4, 9), Vector3(0, 3.4, -16), paint)
	_box("BridgeUpper", Vector3(5.0, 2.5, 5.5), Vector3(0, 6.2, -17), paint)
	_box("WheelhouseWindows", Vector3(5.1, 0.55, 5.6), Vector3(0, 6.75, -17), windows)
	_box("BridgeRoof", Vector3(5.6, 0.2, 6.2), Vector3(0, 7.65, -17), paint)
	_box("AftSuperstructure", Vector3(4.2, 1.8, 8), Vector3(0, 2.7, 24), paint)
	for z in [-5.0, 8.0]:
		var funnel := _cylinder("Funnel", 1.45, 7.0, Vector3(0, 5.3, z), paint)
		funnel.scale.z = 1.25
		_cylinder("FunnelBlackCap", 1.49, 0.7, Vector3(0, 9.15, z), dark).scale.z = 1.25
	for z in [-31.0, 30.0, 39.0]:
		_cylinder("GunMount", 1.55, 1.15, Vector3(0, 2.3, z), paint)
		_box("GunShield", Vector3(2.6, 1.8, 2.6), Vector3(0, 3.05, z), paint)
		var barrel := _cylinder("GunBarrel", 0.095, 5.8, Vector3(0, 3.25, z - 3.5), dark)
		barrel.rotation.x = PI * 0.5
	for z in [1.0, 17.0]:
		_cylinder("TorpedoTurntable", 1.0, 0.3, Vector3(0, 2.0, z), dark)
		for x in [-0.65, 0.0, 0.65]:
			var tube := _cylinder("TorpedoTube", 0.25, 7.0, Vector3(x, 2.5, z), paint)
			tube.rotation.x = PI * 0.5
	for x in [-2.6, 2.6]:
		_box("Lifeboat", Vector3(1.1, 0.65, 5.0), Vector3(x, 3.0, 10), deck)
	for z in [-42.0, 43.0]:
		for x in [-0.8, 0.8]: _cylinder("DeckBollard", 0.16, 0.4, Vector3(x, 2.05, z), dark)
	_cylinder("AnchorCapstan", 0.55, 0.45, Vector3(0, 2.1, -39), dark)
	var beams: Array[Transform3D] = []
	for z in [-13.0, 23.0]:
		var base := Vector3(0, 3.0, z)
		var tip := Vector3(0, 20.0 if z < 0 else 14.0, z + 2.0)
		beams.append(_beam(base, tip, 0.11))
		beams.append(_beam(tip + Vector3(-4, -2, 0), tip + Vector3(4, -2, 0), 0.065))
		for x in [-3.0, 3.0]:
			beams.append(_beam(tip, Vector3(x, 2, z - 7), 0.016))
			beams.append(_beam(tip, Vector3(x, 2, z + 9), 0.016))
	for side in [-1.0, 1.0]:
		var last := Vector3.ZERO
		for i in range(45):
			var u := float(i + 1) / 46.0
			var p := Vector3(side * 4.4 * pow(sin(PI * u), 0.42), 1.65 + 0.75 * pow(1.0 - u, 4.0), -46 + u * 92)
			beams.append(_beam(p, p + Vector3.UP * 1.05, 0.019))
			if i > 0:
				for y in [0.5, 1.05]: beams.append(_beam(last + Vector3.UP * y, p + Vector3.UP * y, 0.014))
			last = p
	var cylinder := CylinderMesh.new()
	cylinder.top_radius = 1
	cylinder.bottom_radius = 1
	cylinder.height = 1
	cylinder.radial_segments = 5
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = cylinder
	mm.instance_count = beams.size()
	for i in beams.size(): mm.set_instance_transform(i, beams[i])
	var lines := MultiMeshInstance3D.new()
	lines.name = "RailingsAndRigging"
	lines.multimesh = mm
	lines.layers = 2
	var wire := ShaderMaterial.new()
	wire.shader = load("res://assets/shaders/wire.gdshader")
	lines.material_override = wire
	add_child(lines)
	radar = Node3D.new()
	radar.name = "RotatingRadar"
	radar.position = Vector3(0, 20, -11)
	add_child(radar)
	_box("RadarPanel", Vector3(2.8, 0.75, 0.12), Vector3.ZERO, dark, radar)

func _beam(a: Vector3, b: Vector3, radius: float) -> Transform3D:
	var y := (b - a).normalized()
	var reference := Vector3.FORWARD if absf(y.dot(Vector3.UP)) > 0.98 else Vector3.UP
	var x := y.cross(reference).normalized()
	var z := x.cross(y).normalized()
	return Transform3D(Basis(x * radius, y * a.distance_to(b), z * radius), (a + b) * 0.5)

func _create_spray() -> void:
	if DisplayServer.get_name() == "headless": return
	for side in [-1.0, 1.0]:
		var particles := GPUParticles3D.new()
		particles.name = "BowSprayPort" if side < 0 else "BowSprayStarboard"
		particles.position = Vector3(side * 1.8, 0.5, -41)
		particles.amount = 1100
		particles.lifetime = 2.3
		particles.local_coords = false
		particles.visibility_aabb = AABB(Vector3(-40, -20, -40), Vector3(80, 70, 120))
		particles.randomness = 0.3
		particles.fixed_fps = 60
		particles.layers = 4
		var process_mat := ShaderMaterial.new()
		process_mat.shader = load("res://assets/shaders/spray_process.gdshader")
		process_mat.set_shader_parameter("side", side)
		particles.process_material = process_mat
		var spray_mat := ShaderMaterial.new()
		spray_mat.shader = load("res://assets/shaders/spray.gdshader")
		var quad := QuadMesh.new()
		quad.size = Vector2(0.09, 0.09)
		quad.material = spray_mat
		particles.draw_pass_1 = quad
		add_child(particles)
		spray_nodes.append(particles)
		spray_materials.append(spray_mat)
		spray_processes.append(process_mat)
