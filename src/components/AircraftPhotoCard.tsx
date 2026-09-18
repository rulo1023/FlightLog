import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ImageBackground, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { aircraftAppearance } from '../lib/flightVisuals';
import { Flight } from '../lib/flights';
import { ThemeColors } from '../theme';

export type AircraftPhoto = { imageUrl: string; pageUrl: string; photographer: string; source: 'Planespotters.net' | 'Wikimedia Commons'; license?: string } | null;

const photoCache = new Map<string, AircraftPhoto>();
const pendingPhotos = new Map<string, Promise<AircraftPhoto>>();
const failedPhotoUrls = new Map<string, Set<string>>();
const waitingPhotoRequests: Array<() => void> = [];
let activePhotoRequests = 0;

function schedulePhotoRequest<T>(request: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = () => {
      activePhotoRequests += 1;
      request().then(resolve, reject).finally(() => {
        activePhotoRequests -= 1;
        waitingPhotoRequests.shift()?.();
      });
    };
    if (activePhotoRequests < 3) start();
    else waitingPhotoRequests.push(start);
  });
}

async function fetchWithTimeout(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    return await fetch(url, { signal: controller.signal, headers });
  } finally {
    clearTimeout(timeout);
  }
}

function plainText(value?: string) {
  return (value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function loadAircraftPhoto(registration: string): Promise<AircraftPhoto> {
  const normalized = registration.trim().toUpperCase();
  if (!normalized) return Promise.resolve(null);
  const cached = photoCache.get(normalized);
  if (cached !== undefined) return Promise.resolve(cached);
  const pending = pendingPhotos.get(normalized);
  if (pending) return pending;

  const request = schedulePhotoRequest(async () => {
    let sourcesAnswered = 0;
    const failedUrls = failedPhotoUrls.get(normalized) || new Set<string>();
    try {
      const response = await fetchWithTimeout(
        `https://api.planespotters.net/pub/photos/reg/${encodeURIComponent(normalized)}`,
        { 'User-Agent': 'FlightLog/0.1 (+https://github.com/rulo1023/FlightLog)' },
      );
      if (!response.ok) throw new Error(String(response.status));
      sourcesAnswered += 1;
      const payload = await response.json() as {
        photos?: Array<{ thumbnail?: { src?: string }; thumbnail_large?: { src?: string }; link?: string; photographer?: string }>;
      };
      const first = payload.photos?.find((item) => {
        const url = item.thumbnail_large?.src || item.thumbnail?.src;
        return Boolean(url && item.link && !failedUrls.has(url));
      });
      const imageUrl = first?.thumbnail_large?.src || first?.thumbnail?.src;
      if (imageUrl && first?.link) {
        const value: AircraftPhoto = { imageUrl, pageUrl: first.link, photographer: first.photographer || 'Autor desconocido', source: 'Planespotters.net' };
        photoCache.set(normalized, value);
        pendingPhotos.delete(normalized);
        return value;
      }
    } catch {}

    try {
      const search = encodeURIComponent(`"${normalized}" aircraft`);
      const response = await fetchWithTimeout(
        `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${search}&gsrnamespace=6&gsrlimit=3&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=900&iiextmetadatafilter=Artist%7CLicenseShortName&format=json&formatversion=2&origin=*`,
        { 'Api-User-Agent': 'FlightLog/0.1 (https://github.com/rulo1023/FlightLog)' },
      );
      if (!response.ok) throw new Error(String(response.status));
      sourcesAnswered += 1;
      const payload = await response.json() as {
        query?: { pages?: Array<{ imageinfo?: Array<{ thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: { Artist?: { value?: string }; LicenseShortName?: { value?: string } } }> }> };
      };
      const info = payload.query?.pages?.flatMap((page) => page.imageinfo || []).find((item) => {
        const url = item.thumburl || item.url;
        return Boolean(url && item.descriptionurl && !failedUrls.has(url));
      });
      const imageUrl = info?.thumburl || info?.url;
      if (imageUrl && info?.descriptionurl) {
        const value: AircraftPhoto = {
          imageUrl,
          pageUrl: info.descriptionurl,
          photographer: plainText(info.extmetadata?.Artist?.value) || 'Autor indicado en Commons',
          license: plainText(info.extmetadata?.LicenseShortName?.value) || undefined,
          source: 'Wikimedia Commons',
        };
        photoCache.set(normalized, value);
        pendingPhotos.delete(normalized);
        return value;
      }
    } catch {}

    // A timeout or temporary block from one source must not become a permanent
    // "no photo" result for the rest of the session.
    if (sourcesAnswered === 2) photoCache.set(normalized, null);
    pendingPhotos.delete(normalized);
    return null;
  });
  pendingPhotos.set(normalized, request);
  return request;
}

function useAircraftPhoto(registration: string) {
  const [photo, setPhoto] = useState<AircraftPhoto | undefined>(() => photoCache.get(registration));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const cached = photoCache.get(registration);
    setPhoto(cached);
    if (!registration || cached !== undefined) return;
    let active = true;
    loadAircraftPhoto(registration).then((value) => { if (active) setPhoto(value); });
    return () => { active = false; };
  }, [attempt, registration]);
  const retryAfterImageError = (imageUrl: string) => {
    const failed = failedPhotoUrls.get(registration) || new Set<string>();
    failed.add(imageUrl);
    failedPhotoUrls.set(registration, failed);
    photoCache.delete(registration);
    pendingPhotos.delete(registration);
    setPhoto(undefined);
    setAttempt((current) => current + 1);
  };
  return { photo, retryAfterImageError };
}

export function AircraftPhotoFrame({ registration, model, colors, height = 165, openOriginal = false }: {
  registration?: string | null;
  model?: string | null;
  colors: ThemeColors;
  height?: number;
  openOriginal?: boolean;
}) {
  const normalized = registration?.trim().toUpperCase() || '';
  const { photo, retryAfterImageError } = useAircraftPhoto(normalized);
  const [imageFailed, setImageFailed] = useState(false);
  const appearance = aircraftAppearance(model);
  useEffect(() => { setImageFailed(false); }, [normalized, photo?.imageUrl]);
  const visiblePhoto = photo && !imageFailed ? photo : null;

  const content = visiblePhoto ? (
    <ImageBackground source={{ uri: visiblePhoto.imageUrl }} style={[styles.photo, { height }]} resizeMode="cover" onError={() => { setImageFailed(true); retryAfterImageError(visiblePhoto.imageUrl); }}>
      <View style={styles.creditOverlay}><Text numberOfLines={1} style={styles.creditText}>{visiblePhoto.photographer} · {visiblePhoto.source}{visiblePhoto.license ? ` · ${visiblePhoto.license}` : ''}</Text></View>
    </ImageBackground>
  ) : (
    <View style={[styles.fallback, { height, backgroundColor: appearance.background }]}> 
      <Ionicons name="airplane" size={52} color={appearance.color} />
      {normalized ? <Text style={[styles.fallbackRegistration, { color: appearance.color }]}>{normalized}</Text> : null}
      <Text style={[styles.fallbackText, { color: appearance.color }]}>{photo === undefined && normalized ? 'Buscando en dos fuentes…' : 'Fotografía no disponible'}</Text>
    </View>
  );

  return visiblePhoto && openOriginal ? <Pressable onPress={() => void Linking.openURL(visiblePhoto.pageUrl)} accessibilityRole="link">{content}</Pressable> : content;
}

export function AircraftRegistrationCard({ flight, count, colors, width }: {
  flight: Flight;
  count: number;
  colors: ThemeColors;
  width?: number;
}) {
  const registration = flight.aircraft_registration?.trim().toUpperCase() || 'Sin matrícula';
  return (
    <View style={[styles.card, { width, backgroundColor: colors.surface, borderColor: colors.line }]}>
      <AircraftPhotoFrame registration={flight.aircraft_registration} model={flight.aircraft_model} colors={colors} height={155} openOriginal />
      <View style={styles.body}>
        <View style={styles.heading}><View style={styles.headingText}><Text style={[styles.registration, { color: colors.ink }]}>{registration}</Text><Text numberOfLines={1} style={[styles.model, { color: colors.muted }]}>{flight.aircraft_model || 'Modelo sin indicar'}</Text></View><View style={[styles.countPill, { backgroundColor: colors.primarySoft }]}><Text style={[styles.countText, { color: colors.primary }]}>{count}×</Text></View></View>
        <Text style={[styles.tapHint, { color: colors.muted }]}>Las fotos disponibles se abren en su fuente original</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', justifyContent: 'flex-end' }, creditOverlay: { alignSelf: 'flex-end', maxWidth: '82%', backgroundColor: 'rgba(10,18,20,.72)', borderTopLeftRadius: 9, paddingHorizontal: 8, paddingVertical: 5 }, creditText: { color: '#FFFFFF', fontSize: 9, fontWeight: '600' },
  fallback: { alignItems: 'center', justifyContent: 'center', gap: 7 }, fallbackRegistration: { fontSize: 19, fontWeight: '900', letterSpacing: .8 }, fallbackText: { fontSize: 11, fontWeight: '700' },
  card: { borderWidth: 1, borderRadius: 21, overflow: 'hidden' }, body: { padding: 14 }, heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, headingText: { flex: 1 }, registration: { fontSize: 18, fontWeight: '800' }, model: { fontSize: 11, marginTop: 3 }, countPill: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5 }, countText: { fontSize: 11, fontWeight: '800' }, tapHint: { fontSize: 9, marginTop: 9 },
});
