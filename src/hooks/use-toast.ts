// src/hooks/use-toasts.ts
import * as React from 'react';

import type { ToastActionElement, ToastProps } from '@/components/ui/toast';

const TOAST_LIMIT = 1;
const TOAST_REMOVE_DELAY = 1_000_000;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const;

let count = 0;

function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type ActionType = typeof actionTypes;

type Action =
  | {
      type: ActionType['ADD_TOAST'];
      toast: ToasterToast;
    }
  | {
      type: ActionType['UPDATE_TOAST'];
      toast: Partial<ToasterToast>;
    }
  | (
      | { type: ActionType['DISMISS_TOAST'] } // no toastId -> dismiss all
      | { type: ActionType['DISMISS_TOAST']; toastId: ToasterToast['id'] } // specific toast
    )
  | (
      | { type: ActionType['REMOVE_TOAST'] } // no toastId -> remove all
      | { type: ActionType['REMOVE_TOAST']; toastId: ToasterToast['id'] } // specific toast
    );

interface State {
  toasts: ToasterToast[];
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

const dispatchers: {
  dispatch: (action: Action) => void;
} = {
  dispatch: () => {
    // replaced once defined below; indirection avoids hoist issues
  },
};

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) return;

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatchers.dispatch({
      type: 'REMOVE_TOAST',
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t,
        ),
      };

    case 'DISMISS_TOAST': {
      const toastId = 'toastId' in action ? action.toastId : undefined;

      // Side effects: schedule removal(s)
      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => addToRemoveQueue(toast.id));
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? { ...t, open: false }
            : t,
        ),
      };
    }

    case 'REMOVE_TOAST': {
      const toastId = 'toastId' in action ? action.toastId : undefined;

      if (toastId === undefined) {
        // remove all
        return { ...state, toasts: [] };
      }

      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== toastId),
      };
    }
  }
};

const listeners: Array<(state: State) => void> = [];

let memoryState: State = { toasts: [] };

function _dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}
dispatchers.dispatch = _dispatch;

type Toast = Omit<ToasterToast, 'id'>;

function toast({ ...props }: Toast) {
  const id = genId();

  const update = (next: ToasterToast) =>
    dispatchers.dispatch({
      type: 'UPDATE_TOAST',
      toast: { ...next, id },
    });

  const dismiss = () => {
    // With exactOptionalPropertyTypes, omit the property when undefined
    dispatchers.dispatch({ type: 'DISMISS_TOAST', toastId: id });
  };

  dispatchers.dispatch({
    type: 'ADD_TOAST',
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return { id, dismiss, update };
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []); // stable subscription; do not re-register on state changes

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => {
      // ✅ KEY FIX: build action shape without `toastId` when undefined
      if (toastId === undefined) {
        dispatchers.dispatch({ type: 'DISMISS_TOAST' });
      } else {
        dispatchers.dispatch({ type: 'DISMISS_TOAST', toastId });
      }
    },
  };
}

export { useToast, toast };
