/**
 * Game Provider
 * Manages multi-table game state
 */

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import type { TableState, GameEvent } from '@foldflop/shared';

interface TableGameState extends TableState {
    myCards: string[];
    aiSuggestion: AISuggestion | null;
    isFullAuto: boolean;
    isMyTurn: boolean;
}

interface AISuggestion {
    action: string;
    amount: number;
    confidence: number;
    reason: string;
}

interface GameState {
    tables: Map<string, TableGameState>;
    activeTableId: string | null;
    maxTables: number;
}

type GameAction =
    | { type: 'ADD_TABLE'; tableId: string; state: TableState }
    | { type: 'REMOVE_TABLE'; tableId: string }
    | { type: 'UPDATE_TABLE'; tableId: string; state: Partial<TableGameState> }
    | { type: 'SET_ACTIVE_TABLE'; tableId: string }
    | { type: 'SET_MY_CARDS'; tableId: string; cards: string[] }
    | { type: 'SET_AI_SUGGESTION'; tableId: string; suggestion: AISuggestion }
    | { type: 'SET_FULL_AUTO'; tableId: string; enabled: boolean }
    | { type: 'HANDLE_EVENT'; tableId: string; event: GameEvent };

function gameReducer(state: GameState, action: GameAction): GameState {
    switch (action.type) {
        case 'ADD_TABLE': {
            const newTables = new Map(state.tables);
            // Preserve myCards from incoming state if available
            const incomingMyCards = (action.state as any).myCards ?? [];
            newTables.set(action.tableId, {
                ...action.state,
                myCards: incomingMyCards,
                aiSuggestion: null,
                isFullAuto: false,
                isMyTurn: false,
            });
            return {
                ...state,
                tables: newTables,
                activeTableId: state.activeTableId ?? action.tableId,
            };
        }

        case 'REMOVE_TABLE': {
            const newTables = new Map(state.tables);
            newTables.delete(action.tableId);
            return {
                ...state,
                tables: newTables,
                activeTableId: state.activeTableId === action.tableId
                    ? (newTables.keys().next().value ?? null)
                    : state.activeTableId,
            };
        }

        case 'UPDATE_TABLE': {
            const existing = state.tables.get(action.tableId);
            if (!existing) return state;

            const newTables = new Map(state.tables);
            newTables.set(action.tableId, { ...existing, ...action.state });
            return { ...state, tables: newTables };
        }

        case 'SET_ACTIVE_TABLE':
            return { ...state, activeTableId: action.tableId };

        case 'SET_MY_CARDS': {
            const existing = state.tables.get(action.tableId);
            if (!existing) return state;

            const newTables = new Map(state.tables);
            newTables.set(action.tableId, { ...existing, myCards: action.cards });
            return { ...state, tables: newTables };
        }

        case 'SET_AI_SUGGESTION': {
            const existing = state.tables.get(action.tableId);
            if (!existing) return state;

            const newTables = new Map(state.tables);
            newTables.set(action.tableId, { ...existing, aiSuggestion: action.suggestion });
            return { ...state, tables: newTables };
        }

        case 'SET_FULL_AUTO': {
            const existing = state.tables.get(action.tableId);
            if (!existing) return state;

            const newTables = new Map(state.tables);
            newTables.set(action.tableId, { ...existing, isFullAuto: action.enabled });
            return { ...state, tables: newTables };
        }

        case 'HANDLE_EVENT': {
            const existing = state.tables.get(action.tableId);
            if (!existing) return state;

            // Handle different event types
            const event = action.event;
            const newTables = new Map(state.tables);

            // Update based on event type
            // This is a simplified version - full implementation would handle all event types

            return { ...state, tables: newTables };
        }

        default:
            return state;
    }
}

interface GameContextValue {
    state: GameState;
    addTable: (tableId: string, tableState: TableState) => void;
    removeTable: (tableId: string) => void;
    setActiveTable: (tableId: string) => void;
    setMyCards: (tableId: string, cards: string[]) => void;
    setAISuggestion: (tableId: string, suggestion: AISuggestion) => void;
    setFullAuto: (tableId: string, enabled: boolean) => void;
    handleEvent: (tableId: string, event: GameEvent) => void;
    getActiveTable: () => TableGameState | null;
}

const GameContext = createContext<GameContextValue | null>(null);

const initialState: GameState = {
    tables: new Map(),
    activeTableId: null,
    maxTables: 12,
};

export function GameProvider({ children }: { children: React.ReactNode }) {
    const [state, dispatch] = useReducer(gameReducer, initialState);

    const addTable = useCallback((tableId: string, tableState: TableState) => {
        dispatch({ type: 'ADD_TABLE', tableId, state: tableState });
    }, []);

    const removeTable = useCallback((tableId: string) => {
        dispatch({ type: 'REMOVE_TABLE', tableId });
    }, []);

    const setActiveTable = useCallback((tableId: string) => {
        dispatch({ type: 'SET_ACTIVE_TABLE', tableId });
    }, []);

    const setMyCards = useCallback((tableId: string, cards: string[]) => {
        dispatch({ type: 'SET_MY_CARDS', tableId, cards });
    }, []);

    const setAISuggestion = useCallback((tableId: string, suggestion: AISuggestion) => {
        dispatch({ type: 'SET_AI_SUGGESTION', tableId, suggestion });
    }, []);

    const setFullAuto = useCallback((tableId: string, enabled: boolean) => {
        dispatch({ type: 'SET_FULL_AUTO', tableId, enabled });
    }, []);

    const handleEvent = useCallback((tableId: string, event: GameEvent) => {
        dispatch({ type: 'HANDLE_EVENT', tableId, event });
    }, []);

    const getActiveTable = useCallback(() => {
        if (!state.activeTableId) return null;
        return state.tables.get(state.activeTableId) ?? null;
    }, [state.activeTableId, state.tables]);

    const value = React.useMemo<GameContextValue>(() => ({
        state,
        addTable,
        removeTable,
        setActiveTable,
        setMyCards,
        setAISuggestion,
        setFullAuto,
        handleEvent,
        getActiveTable,
    }), [
        state,
        addTable,
        removeTable,
        setActiveTable,
        setMyCards,
        setAISuggestion,
        setFullAuto,
        handleEvent,
        getActiveTable,
    ]);

    return (
        <GameContext.Provider value={value}>
            {children}
        </GameContext.Provider>
    );
}

export function useGame(): GameContextValue {
    const context = useContext(GameContext);
    if (!context) {
        throw new Error('useGame must be used within a GameProvider');
    }
    return context;
}
