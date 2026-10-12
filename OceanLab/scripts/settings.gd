class_name OceanSettings extends RefCounted

# Prime-ish lengths suppress aligned repeats (metres), matching the supplied memo.
const LENGTHS := [2003.0, 433.0, 97.0, 23.3, 5.3]
# Disjoint wavelength bands; the smallest cascade handles wavelengths down to 4 texels.
const BAND_MIN := [140.0, 35.0, 8.0, 1.7, 0.08]
const BAND_MAX := [2003.0, 140.0, 35.0, 8.0, 1.7]
const FOAM_LENGTHS := [420.0, 3200.0]
const WATER_ABSORPTION := Vector3(0.35, 0.07, 0.025)
const WATER_BACKSCATTER := Vector3(0.0012, 0.0040, 0.0060)

var resolution := 512
var foam_resolution := 256
var wind_speed := 12.0
var wind_direction := 34.0
var fetch_km := 300.0
var swell_height := 1.1
var swell_period := 11.0
var swell_direction := -24.0
var amplitude := 2.8
var chop := 0.85
var sea_preset := 1
var time_preset := 0
var foam_enabled := true
var wake_enabled := true
var spray_enabled := true

func set_sea(index: int) -> void:
	sea_preset = index
	wind_speed = [5.0, 12.0, 19.0][index]
	swell_height = [0.45, 1.1, 2.0][index]
	chop = [0.55, 0.85, 1.0][index]

func whitecap_fraction() -> float:
	# Monahan & O'Muircheartaigh (1980): W=3.84e-6 U10^3.41, dimensionless.
	# Reference coverage, not a promise that the artistic threshold exactly reproduces W.
	return clampf(3.84e-6 * pow(wind_speed, 3.41), 0.0, 1.0)

func scales() -> PackedVector4Array:
	var result := PackedVector4Array()
	for length_m in LENGTHS:
		result.append(Vector4(1.0 / length_m, 1.0 / length_m, amplitude, amplitude))
	return result
