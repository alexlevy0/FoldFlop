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
    const [isConnected, setIsConnected] = React.useState(true);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            channelsRef.current.forEach(channel => {
                supabase.removeChannel(channel);
            });
            channelsRef.current.clear();
        };
    }, []);

    const subscribeToTable = useCallback((
        tableId: string,
        onEvent: (event: GameEvent) => void
    ) => {
        const channelName = `table:${tableId}`;

        // Check if already subscribed
        if (channelsRef.current.has(channelName)) {
            console.log(`Already subscribed to ${channelName}`);
            return () => { };
        }

        const channel = supabase.channel(channelName)
            .on('broadcast', { event: 'player_joined' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'player_left' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'hand_started' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'cards_dealt' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'player_action' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'phase_changed' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'hand_complete' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'player_timeout' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .on('broadcast', { event: 'chat_message' }, ({ payload }) => {
                onEvent(payload as GameEvent);
            })
            .subscribe((status) => {
                console.log(`Channel ${channelName} status:`, status);
                setIsConnected(status === 'SUBSCRIBED');
            });

        channelsRef.current.set(channelName, channel);

        // Return unsubscribe function
        return () => {
            const ch = channelsRef.current.get(channelName);
            if (ch) {
                supabase.removeChannel(ch);
                channelsRef.current.delete(channelName);
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
