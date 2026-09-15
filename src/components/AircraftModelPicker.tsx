import React, {
  useMemo,
  useState,
} from 'react';

import {
  FlatList,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { AIRCRAFT_MODELS } from '../data/aircraftModels';

type Props = {
  value: string;
  onChange: (value: string) => void;
};

function normalize(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function AircraftModelPicker({
  value,
  onChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = normalize(query.trim());

    if (!q) {
      return [...AIRCRAFT_MODELS];
    }

    return AIRCRAFT_MODELS.filter((model) =>
      normalize(model).includes(q),
    );
  }, [query]);

  function close() {
    setOpen(false);
    setQuery('');
  }

  function select(model: string) {
    onChange(model);
    close();
  }

  const trimmed = query.trim();

  const exactMatch =
    trimmed.length > 0 &&
    AIRCRAFT_MODELS.some(
      (model) =>
        normalize(model) ===
        normalize(trimmed),
    );

  return (
    <>
      <Text style={styles.label}>
        Modelo de avi{'\u00f3'}n
      </Text>

      <Pressable
        style={styles.selector}
        onPress={() => {
          setQuery(value);
          setOpen(true);
        }}
      >
        <Text
          style={[
            styles.selectorText,
            !value && styles.placeholder,
          ]}
          numberOfLines={1}
        >
          {value ||
            'Buscar modelo de avi\u00f3n'}
        </Text>

        <Text style={styles.chevron}>
          {'\u203a'}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={close}
      >
        <SafeAreaView style={styles.modal}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>
                Modelo de avi{'\u00f3'}n
              </Text>

              <Text style={styles.subtitle}>
                Busca por fabricante o modelo
              </Text>
            </View>

            <Pressable
              onPress={close}
              hitSlop={12}
            >
              <Text style={styles.close}>
                Cerrar
              </Text>
            </Pressable>
          </View>

          <TextInput
            autoFocus
            value={query}
            onChangeText={setQuery}
            placeholder={
              'Ej. A320, 737, Embraer...'
            }
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.search}
          />

          {trimmed && !exactMatch ? (
            <Pressable
              style={styles.custom}
              onPress={() =>
                select(trimmed)
              }
            >
              <Text style={styles.customTitle}>
                Usar "{trimmed}"
              </Text>

              <Text style={styles.customText}>
                Introducir modelo manualmente
              </Text>
            </Pressable>
          ) : null}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={
              styles.list
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyTitle}>
                  No hay coincidencias
                </Text>

                <Text style={styles.emptyText}>
                  Puedes usar el texto escrito
                  como modelo manual.
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const selected =
                item === value;

              return (
                <Pressable
                  onPress={() =>
                    select(item)
                  }
                  style={[
                    styles.row,
                    selected &&
                      styles.rowSelected,
                  ]}
                >
                  <Text
                    style={[
                      styles.rowText,
                      selected &&
                        styles.rowTextSelected,
                    ]}
                  >
                    {item}
                  </Text>

                  {selected ? (
                    <Text
                      style={
                        styles.check
                      }
                    >
                      {'\u2713'}
                    </Text>
                  ) : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 7,
    color: '#263332',
  },

  selector: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: '#D6DFDD',
    borderRadius: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    marginBottom: 14,
  },

  selectorText: {
    flex: 1,
    fontSize: 16,
    color: '#233130',
  },

  placeholder: {
    color: '#8A9694',
  },

  chevron: {
    fontSize: 28,
    lineHeight: 28,
    color: '#687574',
    marginLeft: 8,
  },

  modal: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#233130',
  },

  subtitle: {
    marginTop: 3,
    fontSize: 13,
    color: '#72807E',
  },

  close: {
    fontSize: 15,
    fontWeight: '600',
    color: '#16685A',
  },

  search: {
    marginHorizontal: 20,
    marginBottom: 10,
    minHeight: 50,
    borderRadius: 14,
    backgroundColor: '#F3F6F5',
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#233130',
  },

  custom: {
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 15,
    borderRadius: 14,
    backgroundColor: '#EAF4F1',
  },

  customTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#155F53',
  },

  customText: {
    marginTop: 2,
    fontSize: 12,
    color: '#657471',
  },

  list: {
    paddingHorizontal: 20,
    paddingBottom: 30,
  },

  row: {
    minHeight: 52,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E4EAE9',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },

  rowSelected: {
    backgroundColor: '#F1F8F6',
    marginHorizontal: -10,
    paddingHorizontal: 10,
    borderRadius: 10,
  },

  rowText: {
    flex: 1,
    fontSize: 15,
    color: '#263332',
  },

  rowTextSelected: {
    fontWeight: '700',
    color: '#155F53',
  },

  check: {
    marginLeft: 12,
    fontSize: 18,
    fontWeight: '700',
    color: '#155F53',
  },

  empty: {
    paddingVertical: 35,
    alignItems: 'center',
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#263332',
  },

  emptyText: {
    marginTop: 5,
    fontSize: 13,
    color: '#72807E',
    textAlign: 'center',
  },
});
