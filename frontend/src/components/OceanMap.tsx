import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { BoundingBox, FloatSummary, GridAnomalyCell } from '../types';

interface OceanMapProps {
  floats: FloatSummary[];
  selectedFloatId: string | null;
  onSelectFloat: (floatId: string) => void;
  gridCells: GridAnomalyCell[];
  showHeatmap: boolean;
  activeBox: BoundingBox;
}

export const OceanMap: React.FC<OceanMapProps> = ({
  floats,
  selectedFloatId,
  onSelectFloat,
  gridCells,
  showHeatmap,
  activeBox,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const floatLayerRef = useRef<L.LayerGroup | null>(null);
  const gridLayerRef = useRef<L.LayerGroup | null>(null);
  const boxLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [11.5, 78.5],
      zoom: 5,
      minZoom: 3,
      maxZoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      subdomains: 'abcd',
      maxZoom: 19,
    }).addTo(map);

    gridLayerRef.current = L.layerGroup().addTo(map);
    boxLayerRef.current = L.layerGroup().addTo(map);
    floatLayerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Render 1x1 degree thermal anomaly heatmap grid
  useEffect(() => {
    const layer = gridLayerRef.current;
    if (!layer) return;
    layer.clearLayers();
    if (!showHeatmap) return;

    for (const cell of gridCells) {
      const anom = cell.temp_anomaly_c;
      const color =
        anom >= 1.5
          ? '#ff6b4a'
          : anom >= 0.75
            ? '#e8985e'
            : anom <= -0.75
              ? '#388697'
              : '#2a6f72';
      const opacity = Math.min(0.55, Math.max(0.14, Math.abs(anom) * 0.24));

      const rect = L.rectangle(
        [
          [cell.grid_lat, cell.grid_lon],
          [cell.grid_lat + 1, cell.grid_lon + 1],
        ],
        {
          color: cell.is_heatwave ? '#ff6b4a' : color,
          weight: cell.is_heatwave ? 1.4 : 0.5,
          fillColor: color,
          fillOpacity: opacity,
        }
      );

      rect.bindTooltip(
        `<div class="mono" style="font-size:11px;">
          <strong>${cell.grid_lat}°N, ${cell.grid_lon}°E</strong> (${cell.region})<br/>
          Mean SST: ${cell.mean_surface_temp_c.toFixed(2)}°C<br/>
          Baseline: ${cell.baseline_temp_c.toFixed(2)}°C<br/>
          Anomaly: <span style="color:${anom >= 1.5 ? '#ff6b4a' : '#4ea5a8'}">${anom >= 0 ? '+' : ''}${anom.toFixed(2)}°C</span>
        </div>`,
        { sticky: true }
      );
      rect.addTo(layer);
    }
  }, [gridCells, showHeatmap]);

  // Render Bounding-Box Region Inspector rectangle
  useEffect(() => {
    const layer = boxLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    L.rectangle(
      [
        [activeBox.minLat, activeBox.minLon],
        [activeBox.maxLat, activeBox.maxLon],
      ],
      {
        color: '#4ea5a8',
        weight: 1.8,
        dashArray: '6 5',
        fillColor: '#2a6f72',
        fillOpacity: 0.08,
      }
    ).addTo(layer);
  }, [activeBox]);

  // Render Argo Float markers & Coral Pulse Beacons
  useEffect(() => {
    const layer = floatLayerRef.current;
    if (!layer) return;
    layer.clearLayers();

    for (const f of floats) {
      const isSelected = f.float_id === selectedFloatId;

      if (f.is_heatwave_beacon) {
        const icon = L.divIcon({
          className: '',
          html: `<div class="beacon-ring" style="transform:scale(${isSelected ? 1.35 : 1}); box-shadow:0 0 14px rgba(255,107,74,0.75);"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const marker = L.marker([f.lat, f.lon], { icon });
        marker.on('click', () => onSelectFloat(f.float_id));
        marker.bindTooltip(
          `<div class="mono" style="font-size:11px;">
            <strong style="color:#ff6b4a">HEATWAVE BEACON • ${f.float_id}</strong><br/>
            ${f.region} • SST ${f.surface_temp_c ?? '—'}°C (${f.surface_temp_anomaly_c >= 0 ? '+' : ''}${f.surface_temp_anomaly_c}°C)
          </div>`
        );
        marker.addTo(layer);
      } else {
        const marker = L.circleMarker([f.lat, f.lon], {
          radius: isSelected ? 8 : 5.5,
          color: isSelected ? '#ffffff' : '#4ea5a8',
          weight: isSelected ? 2.2 : 1.5,
          fillColor: isSelected ? '#ff6b4a' : '#2a6f72',
          fillOpacity: 0.9,
        });
        marker.on('click', () => onSelectFloat(f.float_id));
        marker.bindTooltip(
          `<div class="mono" style="font-size:11px;">
            <strong>Float ${f.float_id}</strong> (${f.region})<br/>
            SST ${f.surface_temp_c ?? '—'}°C • SSS ${f.surface_salinity_psu ?? '—'} PSU
          </div>`
        );
        marker.addTo(layer);
      }
    }
  }, [floats, selectedFloatId, onSelectFloat]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        minHeight: '480px',
        borderRadius: '12px',
        border: '1px solid var(--border-subtle)',
        overflow: 'hidden',
      }}
    />
  );
};
