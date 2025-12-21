/**
 * Multi-Table Provider
 * Manages state for multiple active poker tables simultaneously
 */

import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

const MAX_TABLES = 6;

interface TableInstance {
    id: string;
    isMyTurn: boolean;
    phase: string;
    pot: number;
    lastUpdate: number;
}

interface MultiTableContextType {
    activeTables: TableInstance[];
    focusedTableId: string | null;
    canJoinMore: boolean;
    addTable: (tableId: string) => boolean;
    removeTable: (tableId: string) => void;
    updateTable: (tableId: string, updates: Partial<TableInstance>) => void;
    setFocusedTable: (tableId: string | null) => void;
    hasAnyTurn: boolean;
    tablesWithTurn: string[];
}

const MultiTableContext = createContext<MultiTableContextType | null>(null);

export function MultiTableProvider({ children }: { children: React.ReactNode }) {
    const [activeTables, setActiveTables] = useState<TableInstance[]>([]);
    const [focusedTableId, setFocusedTableId] = useState<string | null>(null);

    const canJoinMore = activeTables.length < MAX_TABLES;

    const addTable = useCallback((tableId: string): boolean => {
        if (activeTables.length >= MAX_TABLES) {
            return false;
        }
        if (activeTables.some(t => t.id === tableId)) {
            return true; // Already joined
        }
        setActiveTables(prev => [
            ...prev,
            {
                id: tableId,
                isMyTurn: false,
                phase: 'waiting',
                pot: 0,
                lastUpdate: Date.now(),
            }
        ]);
        if (!focusedTableId) {
            setFocusedTableId(tableId);
        }
        return true;
    }, [activeTables, focusedTableId]);

    const removeTable = useCallback((tableId: string) => {
        setActiveTables(prev => prev.filter(t => t.id !== tableId));
        if (focusedTableId === tableId) {
            setFocusedTableId(null);
        }
    }, [focusedTableId]);

    const updateTable = useCallback((tableId: string, updates: Partial<TableInstance>) => {
        setActiveTables(prev => prev.map(t =>
            t.id === tableId
                ? { ...t, ...updates, lastUpdate: Date.now() }
                : t
        ));
    }, []);

    const setFocusedTable = useCallback((tableId: string | null) => {
        setFocusedTableId(tableId);
    }, []);

    const hasAnyTurn = useMemo(() =>
        activeTables.some(t => t.isMyTurn),
        [activeTables]
    );

    const tablesWithTurn = useMemo(() =>
        activeTables.filter(t => t.isMyTurn).map(t => t.id),
        [activeTables]
    );

    const value = useMemo(() => ({
        activeTables,
        focusedTableId,
        canJoinMore,
        addTable,
        removeTable,
        updateTable,
        setFocusedTable,
        hasAnyTurn,
        tablesWithTurn,
    }), [activeTables, focusedTableId, canJoinMore, addTable, removeTable, updateTable, setFocusedTable, hasAnyTurn, tablesWithTurn]);

    return (
        <MultiTableContext.Provider value={value}>
            {children}
        </MultiTableContext.Provider>
    );
}

export function useMultiTable() {
    const context = useContext(MultiTableContext);
    if (!context) {
        throw new Error('useMultiTable must be used within a MultiTableProvider');
    }
    return context;
}

export { MAX_TABLES };
