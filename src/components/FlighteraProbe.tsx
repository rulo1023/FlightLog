import React from 'react';
import { View } from 'react-native';
import { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

export type FlighteraLiveData = {
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  departureDelayMinutes?: number;
  arrivalDelayMinutes?: number;
};

type Props = {
  url: string;
  onData: (data: FlighteraLiveData) => void;
  onFinished?: () => void;
};

export function FlighteraProbe({
  url,
  onData,
  onFinished,
}: Props) {
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;
  useEffect(() => {
    const timer = setTimeout(() => onFinishedRef.current?.(), 12000);
    return () => clearTimeout(timer);
  }, [url]);

  const injectedJavaScript = `
    (function() {
      function value(id) {
        var el = document.getElementById(id);

        if (!el) {
          return null;
        }

        return (el.textContent || '').trim();
      }

      function hhmm(value) {
        if (!value) {
          return null;
        }

        var match = value.match(/([01]?[0-9]|2[0-3]):([0-5][0-9])/);

        if (!match) {
          return null;
        }

        return String(match[1]).padStart(2, '0') + ':' + match[2];
      }

      function delayNear(label) {
        var body = document.body ? document.body.innerText : '';
        var pos = body.indexOf(label);

        if (pos < 0) {
          return null;
        }

        var part = body.slice(pos, pos + 250);

        var late = part.match(/([0-9]+)min late/i);

        if (late) {
          return Number(late[1]);
        }

        var early = part.match(/([0-9]+)min early/i);

        if (early) {
          return -Number(early[1]);
        }

        return null;
      }

      function send() {
        var departure = hhmm(value('depTimeLiveHB'));
        var arrival = hhmm(value('arrTimeLiveHB'));

        if (!departure && !arrival) {
          return;
        }

        window.ReactNativeWebView.postMessage(
          JSON.stringify({
            actualDepartureTime: departure,
            actualArrivalTime: arrival,
            departureDelayMinutes:
              delayNear('ACTUAL DEPARTURE'),
            arrivalDelayMinutes:
              delayNear('ACTUAL ARRIVAL'),
          })
        );
      }

      setTimeout(send, 3500);
      setTimeout(send, 6000);
      setTimeout(send, 9000);
    })();

    true;
  `;

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
            ) as FlighteraLiveData;

            console.log(
              'FLIGHTERA LIVE DATA:',
              data,
            );

            onData(data);
          } catch (error) {
            console.error(
              'FLIGHTERA LIVE PARSE ERROR:',
              error,
            );
          }
        }}
      />
    </View>
  );
}
