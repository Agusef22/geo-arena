"use client";

import { useEffect, useState } from "react";

export function useReverseGeocode(lat: number, lng: number): string {
  const [name, setName] = useState("...");

  useEffect(() => {
    if (!window.google) return;

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
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

        setName(parts.filter(Boolean).join(", ") || "Unknown location");
      } else {
        setName("Unknown location");
      }
    });
  }, [lat, lng]);

  return name;
}
