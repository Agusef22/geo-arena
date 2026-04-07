export function createPinIcon(
  fillColor: string,
  strokeColor: string
): google.maps.Symbol {
  return {
    path: "M16 0C7.16 0 0 7.16 0 16c0 12 16 26 16 26s16-14 16-26C32 7.16 24.84 0 16 0z",
    fillColor,
    fillOpacity: 1,
    strokeColor,
    strokeWeight: 2,
    scale: 0.9,
    anchor: new google.maps.Point(16, 42),
  };
}
