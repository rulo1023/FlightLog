import React from 'react';
import { View } from 'react-native';
import { useEffect, useRef } from 'react';
import { WebView } from 'react-native-webview';

export type FlighteraLiveData = {
  actualDepartureTime?: string;
  actualArrivalTime?: string;
  departureDelayMinutes?: number;
  arrivalDelayMinutes?: number;
  aircraftModel?: string;
  registration?: string;
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

      function aircraftRegistration(body, html) {
        var normalizedHtml = (html || '')
          .replace(/&quot;/gi, '"')
          .replace(/\\u002D/gi, '-');
        var jsonMatch = normalizedHtml.match(
          /"(?:aircraftRegistration|aircraft_registration|registration)"\s*:\s*"([A-Z0-9]{1,3}-[A-Z0-9]{3,6})"/i
        );

        if (jsonMatch) {
          return jsonMatch[1].toUpperCase();
        }

        var labelMatch = (body || '').match(
          /(?:AIRCRAFT\s+)?REGISTRATION\s*[:\n]?\s*([A-Z0-9]{1,3}-[A-Z0-9]{3,6})/i
        );

        return labelMatch ? labelMatch[1].toUpperCase() : null;
      }

      function aircraftModel(body, html) {
        var normalizedHtml = (html || '')
          .replace(/&quot;/gi, '"')
          .replace(/\\\//g, '/');
        var jsonMatch = normalizedHtml.match(
          /"(?:aircraftModel|aircraft_model|aircraftType|aircraft_type|model)"\s*:\s*"([^"<>]{2,60})"/i
        );

        if (jsonMatch) {
          var jsonValue = jsonMatch[1].replace(/\\u002D/gi, '-').trim();
          if (/^(?:Airbus|Boeing|Embraer|ATR|Bombardier|De Havilland|Fokker|McDonnell Douglas|COMAC|Sukhoi|A(?:31[89]|32[01]|20N|21N|3(?:2[0-1]|3[0-9]|4[0-9]|5[0-9]))|B(?:7[0-9]{2}|38M)|E(?:1[789]0|19[05])|AT[467]|CRJ)/i.test(jsonValue)) {
            return jsonValue;
          }
        }

        var commonMatch = (body || '').match(
          /\b(Airbus\s+A\d{3}(?:-\d{2,3})?(?:neo)?|Boeing\s+7\d{2}(?:-\d{2,3})?(?:\s+MAX\s*\d+)?|Embraer\s+(?:E\s*)?\d{3}(?:-E2)?|ATR\s+(?:42|72)(?:-\d{3})?|Bombardier\s+(?:CRJ|Dash)\s*[A-Z0-9-]+|De Havilland\s+(?:Canada\s+)?Dash\s*8[^\n,;]*)\b/i
        );

        if (commonMatch) {
          return commonMatch[1].replace(/\s+/g, ' ').trim();
        }

        var labelMatch = (body || '').match(
          /AIRCRAFT(?:\s+TYPE|\s+MODEL)?\s*[:\n]?\s*((?:A|B|E|AT|CRJ)[A-Z0-9-]{2,8})\b/i
        );

        return labelMatch ? labelMatch[1].toUpperCase() : null;
      }

      function send() {
        var departure = hhmm(value('depTimeLiveHB'));
        var arrival = hhmm(value('arrTimeLiveHB'));
        var body = document.body ? document.body.innerText : '';
        var html = document.documentElement
          ? document.documentElement.innerHTML
          : '';
        var registration = aircraftRegistration(body, html);
        var model = aircraftModel(body, html);

        if (!departure && !arrival && !registration && !model) {
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
            aircraftModel: model,
            registration: registration,
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
