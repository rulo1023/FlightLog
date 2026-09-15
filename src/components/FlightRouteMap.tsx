import React from 'react';
import { Text, View } from 'react-native';
import MapView, {
  Marker,
  Polyline,
} from 'react-native-maps';

import airportData from '../data/airports.min.json';

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Props = {
  departureCode: string;
  arrivalCode: string;
};

const airports =
  airportData as Record<string, Coordinates>;

export function FlightRouteMap({
  departureCode,
  arrivalCode,
}: Props) {
  const departure =
    airports[departureCode.toUpperCase()];

  const arrival =
    airports[arrivalCode.toUpperCase()];

  if (!departure || !arrival) {
    return null;
  }

  const minLat = Math.min(
    departure.latitude,
    arrival.latitude,
  );

  const maxLat = Math.max(
    departure.latitude,
    arrival.latitude,
  );

  const minLon = Math.min(
    departure.longitude,
    arrival.longitude,
  );

  const maxLon = Math.max(
    departure.longitude,
    arrival.longitude,
  );

  const latitude =
    (minLat + maxLat) / 2;

  const longitude =
    (minLon + maxLon) / 2;

  const latitudeDelta =
    Math.max(
      (maxLat - minLat) * 1.8,
      1.2,
    );

  const longitudeDelta =
    Math.max(
      (maxLon - minLon) * 1.8,
      1.2,
    );

  return (
    <View style={{ marginTop: 18 }}>
      <Text
        style={{
          fontSize: 16,
          fontWeight: '700',
          marginBottom: 10,
        }}
      >
        Ruta
      </Text>

      <View
        style={{
          height: 230,
          borderRadius: 18,
          overflow: 'hidden',
        }}
      >
        <MapView
          style={{
            width: '100%',
            height: '100%',
          }}
          initialRegion={{
            latitude,
            longitude,
            latitudeDelta,
            longitudeDelta,
          }}
          scrollEnabled
          zoomEnabled
          rotateEnabled={false}
          pitchEnabled={false}
        >
          <Marker
            coordinate={departure}
            title={departureCode.toUpperCase()}
          />

          <Marker
            coordinate={arrival}
            title={arrivalCode.toUpperCase()}
          />

          <Polyline
            coordinates={[
              departure,
              arrival,
            ]}
            strokeWidth={3}
          />
        </MapView>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginTop: 8,
        }}
      >
        <Text style={{ fontWeight: '700' }}>
          {departureCode.toUpperCase()}
        </Text>

        <Text style={{ fontWeight: '700' }}>
          {arrivalCode.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}
