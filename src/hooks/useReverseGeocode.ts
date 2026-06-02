"use client";

import { useEffect, useState } from "react";

// Module-level cache: the same coordinates get geocoded repeatedly across
// RoundResult / GameSummary rows / DuelRoundResult. Dedupe to save quota.
const geocodeCache = new Map<string, string>();
const cacheKey = (lat: number, lng: number) =>
  `${lat.toFixed(5)},${lng.toFixed(5)}`;

export function useReverseGeocode(lat: number, lng: number): string {
  const key = cacheKey(lat, lng);
  // Bump to re-render once an async geocode populates the cache.
  const [, bump] = useState(0);

  useEffect(() => {
    if (!window.google) return;
    if (geocodeCache.has(key)) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      let resolved: string;
      if (status === "OK" && results && results.length > 0) {
        const locality = results.find((r) => r.types.includes("locality"));
        const admin = results.find((r) =>
          r.types.includes("administrative_area_level_1")
        );
        const countryResult = results.find((r) =>
          r.types.includes("country")
        );

        const parts: string[] = [];
        if (locality) {
          parts.push(
            locality.address_components.find((c) =>
              c.types.includes("locality")
            )?.long_name || ""
          );
        } else if (admin) {
          parts.push(
            admin.address_components.find((c) =>
              c.types.includes("administrative_area_level_1")
            )?.long_name || ""
          );
        }
        if (countryResult) {
          parts.push(
            countryResult.address_components.find((c) =>
              c.types.includes("country")
            )?.long_name || ""
          );
        }

        resolved = parts.filter(Boolean).join(", ") || "Unknown location";
      } else {
        resolved = "Unknown location";
      }

      geocodeCache.set(key, resolved);
      bump((n) => n + 1);
    });
  }, [key, lat, lng]);

  // Derived during render — no synchronous setState in the effect.
  return geocodeCache.get(key) ?? "...";
}
