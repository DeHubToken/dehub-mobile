import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useWebSocket } from '../../context/WebSocketContext';
import { DMSocketEvent } from '../../services/enums/dm-socket-events.enum';

type DMSocketTestProps = {
  className?: string;
};

const DMSocketTest: React.FC<DMSocketTestProps> = ({ className }) => {
  const ws = useWebSocket();
  const [testing, setTesting] = useState<boolean>(false);
  const [lastAck, setLastAck] = useState<any>(null);
  const [lastEvent, setLastEvent] = useState<any>(null);

  useEffect(() => {
    const unsub = ws.on(DMSocketEvent.Test, (resp: any) => setLastEvent(resp));
    return () => { try { unsub(); } catch {} };
  }, [ws]);

  const handleDmSocketTest = useCallback(() => {
    if (testing) return;
    setTesting(true);
    setLastAck(null);
    const payload = { hello: 'from mobile', at: new Date().toISOString() };
    ws.emitAuthed(DMSocketEvent.Test, payload, (resp?: any) => {
      setLastAck(resp ?? { ok: false, note: 'No ack payload' });
      setTesting(false);
    });
  }, [testing, ws]);

  const buttonLabel = useMemo(() => (testing ? 'Testing…' : 'Test'), [testing]);

  return (
    <View className={`rounded-xl bg-theme-neutrals-800 px-3 py-3 ${className ?? ''}`}>
      <View className="flex-row items-center justify-between">
        <Text className="text-theme-neutrals-100 font-medium">DM Socket</Text>
        <TouchableOpacity
          onPress={handleDmSocketTest}
          disabled={testing}
          className="px-3 py-1.5 rounded-lg bg-blue-600 active:opacity-80 disabled:opacity-40"
          accessibilityRole="button"
          accessibilityLabel="Test DM socket connectivity"
        >
          <Text className="text-white text-xs">{buttonLabel}</Text>
        </TouchableOpacity>
      </View>
      {lastAck ? (
        <View className="mt-2">
          <Text className="text-theme-neutrals-300 text-[12px]">Ack:</Text>
          <Text className="text-theme-neutrals-200 text-[12px]" numberOfLines={3}>
            {JSON.stringify(lastAck)}
          </Text>
        </View>
      ) : null}
      {lastEvent ? (
        <View className="mt-2">
          <Text className="text-theme-neutrals-300 text-[12px]">Event reply:</Text>
          <Text className="text-theme-neutrals-200 text-[12px]" numberOfLines={3}>
            {JSON.stringify(lastEvent)}
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export default DMSocketTest;
