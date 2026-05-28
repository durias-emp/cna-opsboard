import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'

export function useTodos(aircraftId) {
  const [todos,   setTodos]   = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!aircraftId || aircraftId === 'local-1') { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase
      .from('todos')
      .select('*')
      .eq('aircraft_id', aircraftId)
      .order('created_at', { ascending: false })

    if (!error && data) setTodos(data)
    setLoading(false)
  }, [aircraftId])

  useEffect(() => { load() }, [load])

  // ── Write helpers — optimistic update first, background reload for consistency ──

  async function addTodo(payload) {
    const { data, error } = await supabase
      .from('todos')
      .insert({ ...payload, aircraft_id: aircraftId })
      .select()
      .single()

    if (error) throw new Error(error.message ?? 'Failed to save task')

    // Update local state immediately so the drawer can close
    if (data) setTodos(prev => [data, ...prev])

    // Background sync — no await, won't block UI
    load()
  }

  async function updateTodo(id, changes) {
    const { data, error } = await supabase
      .from('todos')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) throw new Error(error.message ?? 'Failed to update task')

    // Patch the item in local state immediately
    if (data) setTodos(prev => prev.map(t => t.id === id ? data : t))

    // Background sync
    load()
  }

  async function deleteTodo(id) {
    const { error } = await supabase.from('todos').delete().eq('id', id)
    if (error) throw new Error(error.message ?? 'Failed to delete task')

    // Remove immediately from local state
    setTodos(prev => prev.filter(t => t.id !== id))

    // Background sync
    load()
  }

  async function undoComplete(todo) {
    await updateTodo(todo.id, {
      status:           'todo',
      completed_at:     null,
      completion_notes: null,
    })
  }

  async function completeTodo(todo, { completedDate, notes }) {
    await updateTodo(todo.id, {
      status:           'done',
      completed_at:     completedDate
        ? new Date(completedDate + 'T12:00:00').toISOString()
        : new Date().toISOString(),
      completion_notes: notes?.trim() || null,
    })
  }

  const todo       = todos.filter(t => t.status === 'todo')
  const inProgress = todos.filter(t => t.status === 'in_progress')
  const done       = todos.filter(t => t.status === 'done')

  return { todos, todo, inProgress, done, loading, refresh: load, addTodo, updateTodo, deleteTodo, completeTodo, undoComplete }
}
