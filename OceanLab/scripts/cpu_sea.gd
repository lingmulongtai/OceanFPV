class_name CPUSea extends RefCounted
## Reduced analytic fallback for headless / OpenGL; deliberately labelled NON-FFT.
## The Vulkan path uses the full spectral simulation, never these waves.

var settings: OceanSettings
var waves := PackedVector4Array()
var frequencies := PackedFloat32Array()

func _init(config: OceanSettings) -> void:
	settings = config
	rebuild()

func rebuild() -> void:
	waves.clear()
	frequencies.clear()
	for i in range(16):
		var wavelength: float = [210.0, 142.0, 98.0, 73.0, 51.0, 35.0, 24.0, 16.0, 11.0, 7.0, 4.5, 3.1, 2.0, 1.3, 0.8, 0.5][i]
		var direction := deg_to_rad(settings.wind_direction + sin(float(i) * 2.399) * 42.0)
		if i < 3: direction = deg_to_rad(settings.swell_direction + float(i - 1) * 17.0)
		var k := TAU / wavelength
		var a := 0.30 * exp(-float(i) * 0.27) * settings.amplitude * settings.wind_speed / 12.0
		if i < 3: a *= settings.swell_height
		waves.append(Vector4(cos(direction) * k, sin(direction) * k, a, float(i) * 1.754))
		frequencies.append(sqrt(9.81 * k))

func height_at(point: Vector2, time: float) -> float:
	var height := 0.0
	for i in waves.size():
		var w := waves[i]
		height += w.z * sin(w.x * point.x + w.y * point.y - frequencies[i] * time + w.w)
	return height

func heights(points: PackedVector3Array, time: float) -> PackedFloat32Array:
	var result := PackedFloat32Array()
	for p in points: result.append(height_at(Vector2(p.x, p.z), time))
	return result
