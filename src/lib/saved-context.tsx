"use client";

import { createContext, useContext, useState, useCallback, useMemo, useEffect, type ReactNode } from "react";

export interface SavedList {
  id: string;
  name: string;
  restaurantIds: string[];
}

export interface Booking {
  id: string;
  restaurantId: string;
  restaurantName: string;
  date: string;
  time: string;
  guests: number;
  reviewed: boolean;
  rating?: number;
}

interface SavedState {
  savedIds: string[];
  lists: SavedList[];
  bookings: Booking[];
}

interface SavedContextValue {
  savedIds: string[];
  lists: SavedList[];
  bookings: Booking[];
  toggleSave: (id: string) => void;
  isSaved: (id: string) => boolean;
  createList: (name: string) => void;
  addToList: (listId: string, restaurantId: string) => void;
  addBooking: (booking: Booking) => void;
}

const STORAGE_KEY = "tavli-saved";

function loadSaved(): SavedState {
  if (typeof window === "undefined") return { savedIds: [], lists: [], bookings: [] };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as SavedState;
  } catch {
    // ignore
  }
  return { savedIds: [], lists: [], bookings: [] };
}

function persistSaved(state: SavedState) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const SavedContext = createContext<SavedContextValue | null>(null);

export function SavedProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SavedState>(() => loadSaved());

  useEffect(() => {
    persistSaved(state);
  }, [state]);

  const toggleSave = useCallback((id: string) => {
    setState((prev) => {
      const exists = prev.savedIds.includes(id);
      return {
        ...prev,
        savedIds: exists ? prev.savedIds.filter((s) => s !== id) : [...prev.savedIds, id],
      };
    });
  }, []);

  const isSaved = useCallback(
    (id: string) => state.savedIds.includes(id),
    [state.savedIds],
  );

  const createList = useCallback((name: string) => {
    setState((prev) => ({
      ...prev,
      lists: [
        ...prev.lists,
        { id: crypto.randomUUID(), name, restaurantIds: [] },
      ],
    }));
  }, []);

  const addToList = useCallback((listId: string, restaurantId: string) => {
    setState((prev) => ({
      ...prev,
      lists: prev.lists.map((l) =>
        l.id === listId && !l.restaurantIds.includes(restaurantId)
          ? { ...l, restaurantIds: [...l.restaurantIds, restaurantId] }
          : l,
      ),
    }));
  }, []);

  const addBooking = useCallback((booking: Booking) => {
    setState((prev) => ({
      ...prev,
      bookings: [...prev.bookings, booking],
    }));
  }, []);

  const value = useMemo<SavedContextValue>(
    () => ({
      savedIds: state.savedIds,
      lists: state.lists,
      bookings: state.bookings,
      toggleSave,
      isSaved,
      createList,
      addToList,
      addBooking,
    }),
    [state.savedIds, state.lists, state.bookings, toggleSave, isSaved, createList, addToList, addBooking],
  );

  return <SavedContext value={value}>{children}</SavedContext>;
}

export function useSaved(): SavedContextValue {
  const ctx = useContext(SavedContext);
  if (!ctx) {
    throw new Error("useSaved must be used within a SavedProvider");
  }
  return ctx;
}
