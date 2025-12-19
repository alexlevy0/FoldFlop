/**
 * useAI hook
 * Manages AI copilot suggestions
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { getSuggestion, type AISuggestion } from '@foldflop/ai-engine';
import { parseCard, type GameState, type Card } from '@foldflop/poker-engine';

interface UseAIReturn {
    suggestion: AISuggestion | null;
    isFullAuto: boolean;
    setFullAuto: (enabled: boolean) => void;
    getSuggestionNow: () => AISuggestion | null;
}

export function useAI(
    myCards: string[],
    communityCards: string[],
    gamePhase: string,
    isMyTurn: boolean,
    gameStateForAI: GameState | null,
    playerIndex: number,
    onAutoAction?: (suggestion: AISuggestion) => void
): UseAIReturn {
    const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
    const [isFullAuto, setIsFullAuto] = useState(false);
    const autoActionTriggeredRef = useRef(false);

    // Convert string cards to Card objects
    const parseCardsSafe = useCallback((cards: string[]): Card[] => {
        try {
            return cards.map(c => parseCard(c));
        } catch {
            return [];
        }
    }, []);

    // Calculate suggestion when it's our turn
    useEffect(() => {
        if (!isMyTurn || myCards.length !== 2 || !gameStateForAI) {
            setSuggestion(null);
            autoActionTriggeredRef.current = false;
            return;
        }

        // Generate suggestion
        const newSuggestion = getSuggestion(gameStateForAI, playerIndex);
        setSuggestion(newSuggestion);
        autoActionTriggeredRef.current = false;

    }, [isMyTurn, myCards, communityCards, gamePhase, gameStateForAI, playerIndex]);

    // Handle full auto mode
    useEffect(() => {
        if (isFullAuto && suggestion && isMyTurn && !autoActionTriggeredRef.current) {
            autoActionTriggeredRef.current = true;
            // Small delay to show the suggestion briefly
            const timer = setTimeout(() => {
                onAutoAction?.(suggestion);
            }, 500);

            return () => clearTimeout(timer);
        }
    }, [isFullAuto, suggestion, isMyTurn, onAutoAction]);

    const getSuggestionNow = useCallback(() => {
        if (!gameStateForAI || myCards.length !== 2) return null;
        return getSuggestion(gameStateForAI, playerIndex);
    }, [gameStateForAI, myCards, playerIndex]);

    return {
        suggestion,
        isFullAuto,
        setFullAuto: setIsFullAuto,
        getSuggestionNow,
    };
}
