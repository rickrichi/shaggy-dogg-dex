import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

// ---------- Types ----------
type Id = string;
interface Todo {
  id: Id;
  title: string;
  completed: boolean;
  created_at: string;
  updated_at: string | null;
}
interface NewTodoInput { title: string }
interface UpdateTodoInput { id: Id; completed: boolean }

// ---------- Type guards ----------
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isTodo = (u: unknown): u is Todo =>
  isRecord(u) &&
  typeof u.id === 'string' &&
  typeof u.title === 'string' &&
  typeof u.completed === 'boolean' &&
  typeof u.created_at === 'string' &&
  (typeof u.updated_at === 'string' || u.updated_at === null);
const isTodoArray = (u: unknown): u is Todo[] => Array.isArray(u) && u.every(isTodo);

// ---------- API ----------
const client: SupabaseClient = supabase;

async function fetchTodos(): Promise<Todo[]> {
  const { data, error } = await client
    .from('todos')               // ⟵ removed <Todo>
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  if (!isTodoArray(data)) throw new Error('Unexpected todos shape');
  return data;
}

async function createTodo(input: NewTodoInput): Promise<Todo> {
  const title = input.title.trim();
  if (title.length === 0) throw new Error('Title is required');

  const { data, error } = await client
    .from('todos')               // ⟵ removed <Todo>
    .insert({ title, completed: false })
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !isTodo(data)) throw new Error('Insert returned invalid row');
  return data;
}

async function setCompleted(input: UpdateTodoInput): Promise<Todo> {
  const { id, completed } = input;
  const { data, error } = await client
    .from('todos')               // ⟵ removed <Todo>
    .update({ completed })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data || !isTodo(data)) throw new Error('Update returned invalid row');
  return data;
}

async function removeTodo(id: Id): Promise<void> {
  const { error } = await client.from('todos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ---------- Page ----------
export default function Todos() {
  const qc = useQueryClient();

  const { data: todos = [], error, isLoading } = useQuery({
    queryKey: ['todos'],
    queryFn: fetchTodos,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: createTodo,
    onMutate: async (input: NewTodoInput) => {
      await qc.cancelQueries({ queryKey: ['todos'] });
      const prev = qc.getQueryData<Todo[]>(['todos']) ?? [];
      const optimistic: Todo = {
        id: `temp-${Date.now()}`,
        title: input.title.trim(),
        completed: false,
        created_at: new Date().toISOString(),
        updated_at: null,
      };
      qc.setQueryData<Todo[]>(['todos'], [optimistic, ...prev]);
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(['todos'], ctx.prev);
    },
    onSuccess: (row) => {
      qc.setQueryData<Todo[]>(['todos'], (cur = []) =>
        [row, ...cur.filter(t => !t.id.startsWith('temp-'))]
      );
    },
  });

  const toggleMutation = useMutation({
    mutationFn: setCompleted,
    onMutate: async ({ id, completed }: UpdateTodoInput) => {
      await qc.cancelQueries({ queryKey: ['todos'] });
      const prev = qc.getQueryData<Todo[]>(['todos']) ?? [];
      qc.setQueryData<Todo[]>(['todos'], prev.map(t => t.id === id ? { ...t, completed } : t));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['todos'], ctx.prev); },
  });

  const deleteMutation = useMutation({
    mutationFn: removeTodo,
    onMutate: async (id: Id) => {
      await qc.cancelQueries({ queryKey: ['todos'] });
      const prev = qc.getQueryData<Todo[]>(['todos']) ?? [];
      qc.setQueryData<Todo[]>(['todos'], prev.filter(t => t.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['todos'], ctx.prev); },
  });

  useEffect(() => {
    const channel = client
      .channel('public:todos')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, () => {
        qc.invalidateQueries({ queryKey: ['todos'] }).catch(() => {});
      })
      .subscribe();
    return () => {
      client.removeChannel(channel);
    };
  }, [qc]);

  const [title, setTitle] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  const onAdd = (): void => {
    const trimmed = title.trim();
    if (!trimmed) return;
    createMutation.mutate({ title: trimmed });
    setTitle('');
    inputRef.current?.focus();
  };

  const pending = isLoading || createMutation.isPending || toggleMutation.isPending || deleteMutation.isPending;
  const errorMsg = error ? (error as Error).message : null;

  return (
    <div className="max-w-xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-semibold">Todos</h1>

      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={title}
          onChange={(e) => setTitle(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onAdd(); }}
          placeholder="Add a task…"
          className="flex-1 border rounded px-3 py-2"
          aria-label="New todo title"
        />
        <button
          onClick={onAdd}
          disabled={title.trim().length === 0 || createMutation.isPending}
          className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50"
        >
          Add
        </button>
      </div>

      {pending && todos.length === 0 && <div className="text-sm text-gray-500">Loading…</div>}
      {errorMsg && <div className="text-sm text-red-600">Error: {errorMsg}</div>}

      <ul className="space-y-2">
        {todos.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded border p-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={t.completed}
                onChange={(e) => toggleMutation.mutate({ id: t.id, completed: e.currentTarget.checked })}
                aria-label={`Toggle ${t.title}`}
              />
              <span className={t.completed ? 'line-through text-gray-500' : ''}>{t.title}</span>
            </label>
            <button onClick={() => deleteMutation.mutate(t.id)} className="text-red-600 hover:underline">
              Delete
            </button>
          </li>
        ))}
      </ul>

      <div className="text-xs text-gray-500">
        {todos.length} item{todos.length === 1 ? '' : 's'}
      </div>
    </div>
  );
}
