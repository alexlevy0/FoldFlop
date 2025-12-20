/**
 * Socket Provider
 * Manages Supabase Realtime connections for game tables
 */

import React, { createContext, useContext, useCallback, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import type { GameEvent } from '@foldflop/shared';

interface SocketContextValue {
    subscribeToTable: (tableId: string, onEvent: (event: GameEvent) => void) => () => void;
    sendChatMessage: (tableId: string, message: string) => Promise<void>;
    isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue | null>(null);

export function SocketProvider({ children }: { children: React.ReactNode }) {
    const channelsRef = useRef<Map<string, RealtimeChannel>>(new Map());
    const callbacksRef = useRef<Map<string, (event: GameEvent) => void>>(new Map());
    const [isConnected, setIsConnected] = React.useState(true);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            channelsRef.current.forEach(channel => {
                supabase.removeChannel(channel);
            });
            channelsRef.current.clear();
            callbacksRef.current.clear();
        };
    }, []);

    const subscribeToTable = useCallback((
        tableId: string,
        onEvent: (event: GameEvent) => void
    ) => {
        const channelName = `table:${tableId}`;

        // Always update callback to latest
        callbacksRef.current.set(channelName, onEvent);

        // If already subscribed, don't create new channel
        if (channelsRef.current.has(channelName)) {
            // console.log(`[Socket] Already subscribed to ${channelName}, callback updated`);
            return () => {
                // When a component unmounts, we don't necessarily want to kill the channel 
                // if other components use it. For now, we'll just remove the callback reference 
                // but keep the channel alive to prevent thrashing.
                // ideally we'd use ref counting.
                // callbacksRef.current.delete(channelName);
            };
        }

        console.log(`[Socket] Creating new subscription to ${channelName}`);

        // Wrapper that always uses latest callback
        const forwardEvent = (payload: any) => {
            const callback = callbacksRef.current.get(channelName);
            if (callback) {
                callback(payload as GameEvent);
            }
        };

        const channel = supabase.channel(channelName)
            .on('broadcast', { event: 'player_joined' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'player_left' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'hand_started' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'cards_dealt' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'player_action' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'phase_changed' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'hand_complete' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'player_timeout' }, ({ payload }) => forwardEvent(payload))
            .on('broadcast', { event: 'chat_message' }, ({ payload }) => forwardEvent(payload))
            .subscribe((status) => {
                console.log(`[Socket] Channel ${channelName} status:`, status);
                setIsConnected(status === 'SUBSCRIBED');
            });

        channelsRef.current.set(channelName, channel);

        // Return unsubscribe function
        return () => {
            // Implementation of Ref Counting or lazy disconnect would be better here.
            // For now, let's keep it simple: if this unmounts, we disconnect.
            // BUT, useTable unmounting causes this. 
            // The issue is likely useTable re-running the effect.
            const ch = channelsRef.current.get(channelName);
            if (ch) {
                console.log(`[Socket] Unsubscribing from ${channelName}`);
                supabase.removeChannel(ch);
                channelsRef.current.delete(channelName);
                callbacksRef.current.delete(channelName);
            }
        };
    }, []);

    const sendChatMessage = useCallback(async (tableId: string, message: string) => {
        const channelName = `table:${tableId}`;
        const channel = channelsRef.current.get(channelName);

        if (!channel) {
            console.warn('Not subscribed to table:', tableId);
            return;
        }

        await channel.send({
            type: 'broadcast',
            event: 'chat_message',
            payload: {
                type: 'chat_message',
                tableId,
                timestamp: Date.now(),
                message,
            },
        });
    }, []);

    const value: SocketContextValue = {
        subscribeToTable,
        sendChatMessage,
        isConnected,
    };

    return (
        <SocketContext.Provider value={value}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocket(): SocketContextValue {
    const context = useContext(SocketContext);
    if (!context) {
        throw new Error('useSocket must be used within a SocketProvider');
    }
    return context;
}
