import React from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';

export type PlaneFinderAircraftData = {
  registration?: string;
  aircraftModel?: string;
};

type Props = {
  flightNumber: string;
  flightDate: string;
  departureCode: string;
  arrivalCode: string;
  onData: (data: PlaneFinderAircraftData) => void;
  onFinished?: () => void;
};

function planeFinderDateLabel(dateKey: string): string {
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr',
    'May', 'Jun', 'Jul', 'Aug',
    'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return dateKey;
  }

  const year = match[1];
  const monthIndex = Number(match[2]) - 1;
  const day = String(Number(match[3]));

  return `${day} ${months[monthIndex]} ${year}`;
}

export function isRecentPlaneFinderDate(dateKey: string): boolean {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return false;
  }

  const target = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );

  const today = new Date();

  target.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const diffDays =
    Math.floor(
      (today.getTime() - target.getTime()) / 86400000,
    );

  return diffDays >= 0 && diffDays <= 7;
}

export function PlaneFinderProbe({
  flightNumber,
  flightDate,
  departureCode,
  arrivalCode,
  onData,
  onFinished,
}: Props) {
  const dateLabel = planeFinderDateLabel(flightDate);

  const injectedJavaScript = `
(function() {
  var wantedDate = ${JSON.stringify(dateLabel)};
  var wantedDeparture = ${JSON.stringify(departureCode.toUpperCase())};
  var wantedArrival = ${JSON.stringify(arrivalCode.toUpperCase())};
  var alreadySent = false;

  function clean(value) {
    return (value || '')
      .replace(/\\s+/g, ' ')
      .trim();
  }

  function send() {
    if (alreadySent) {
      return;
    }

    var rows = Array.prototype.slice.call(
      document.querySelectorAll('tr')
    );

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var cells = row.querySelectorAll('td');

      if (!cells || cells.length < 7) {
        continue;
      }

      var rowDate = clean(cells[0].textContent);

      if (rowDate !== wantedDate) {
        continue;
      }

      var airportLinks = row.querySelectorAll(
        'a[href*="/data/airport/"]'
      );

      var airports = [];

      for (var j = 0; j < airportLinks.length; j++) {
        var href = airportLinks[j].getAttribute('href') || '';
        var match = href.match(/\\/data\\/airport\\/([A-Z0-9]{3,4})/i);

        if (match) {
          airports.push(match[1].toUpperCase());
        }
      }

      if (
        airports.indexOf(wantedDeparture) < 0 ||
        airports.indexOf(wantedArrival) < 0
      ) {
        continue;
      }

      var aircraftLink = row.querySelector(
        'a[href*="/data/aircraft/"]'
      );

      if (!aircraftLink) {
        continue;
      }

      var aircraftHref =
        aircraftLink.getAttribute('href') || '';

      var registrationMatch =
        aircraftHref.match(
          /\\/data\\/aircraft\\/([A-Z0-9-]+)/i
        );

      if (!registrationMatch) {
        continue;
      }

      var aircraftModel =
        cells.length >= 7
          ? clean(cells[cells.length - 3].textContent)
          : null;

      if (
        !aircraftModel ||
        aircraftModel.toLowerCase() === 'unknown'
      ) {
        aircraftModel = null;
      }

      alreadySent = true;

      window.ReactNativeWebView.postMessage(
        JSON.stringify({
          registration:
            registrationMatch[1].toUpperCase(),
          aircraftModel: aircraftModel,
        })
      );

      return;
    }
  }

  setTimeout(send, 1500);
  setTimeout(send, 3500);
  setTimeout(send, 6000);
  setTimeout(send, 9000);
})();

true;
`;

  const url =
    `https://planefinder.net/data/flight/${encodeURIComponent(
      flightNumber.trim().toUpperCase(),
    )}`;

  return (
    <View
      style={{
        width: 1,
        height: 1,
        opacity: 0,
        position: 'absolute',
      }}
      pointerEvents="none"
    >
      <WebView
        source={{ uri: url }}
        javaScriptEnabled
        domStorageEnabled
        injectedJavaScript={injectedJavaScript}
        onMessage={(event) => {
          try {
            const data = JSON.parse(
              event.nativeEvent.data,
            ) as PlaneFinderAircraftData;

            console.log(
              'PLANEFINDER AIRCRAFT DATA:',
              data,
            );

            onData(data);
          } catch (error) {
            console.error(
              'PLANEFINDER PARSE ERROR:',
              error,
            );
          } finally {
            onFinished?.();
          }
        }}
        onHttpError={(event) => {
          console.log(
            'PLANEFINDER HTTP ERROR:',
            event.nativeEvent.statusCode,
          );

          onFinished?.();
        }}
        onError={(event) => {
          console.log(
            'PLANEFINDER WEBVIEW ERROR:',
            event.nativeEvent.description,
          );

          onFinished?.();
        }}
      />
    </View>
  );
}
