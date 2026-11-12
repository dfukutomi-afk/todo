(() => {
  'use strict';

  const STORAGE_KEY = 'todo-app.v1';
  const MAX_LENGTH = 200;
  const FILTERS = {
    all: () => true,
    active: (todo) => !todo.done,
    completed: (todo) => todo.done,
  };

  const el = {
    form: document.getElementById('new-todo-form'),
    input: document.getElementById('new-todo-input'),
    list: document.getElementById('todo-list'),
    empty: document.getElementById('empty'),
    toolbar: document.getElementById('toolbar'),
    toggleAll: document.getElementById('toggle-all'),
    filterLinks: document.querySelectorAll('[data-filter]'),
    footer: document.getElementById('footer'),
    count: document.getElementById('count'),
    clearCompleted: document.getElementById('clear-completed'),
  };

  const state = {
    todos: loadTodos(),
    filter: readFilter(),
    editingId: null,
    focusAfterRender: null, // 編集終了後にフォーカスを戻す先のタスクID
  };

  // ---------- 永続化 ----------

  function loadTodos() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(data)) return [];
      return data
        .filter((t) => t && typeof t.id === 'string' && typeof t.title === 'string')
        .map((t) => ({
          id: t.id,
          title: t.title,
          done: Boolean(t.done),
          createdAt: Number(t.createdAt) || Date.now(),
        }));
    } catch {
      return [];
    }
  }

  function saveTodos() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos));
    } catch {
      // ストレージが使えない環境(プライベートモード等)ではメモリ上だけで動作する
    }
  }

  function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function readFilter() {
    const name = location.hash.replace(/^#\/?/, '');
    return Object.hasOwn(FILTERS, name) ? name : 'all';
  }

  function normalizeTitle(text) {
    return text.trim().slice(0, MAX_LENGTH);
  }

  // ---------- 操作 ----------

  function commit() {
    saveTodos();
    render();
  }

  function findTodo(id) {
    return state.todos.find((t) => t.id === id);
  }

  function addTodo(text) {
    const title = normalizeTitle(text);
    if (!title) return false;
    state.todos.push({ id: newId(), title, done: false, createdAt: Date.now() });
    commit();
    return true;
  }

  function setDone(id, done) {
    const todo = findTodo(id);
    if (!todo) return;
    todo.done = done;
    commit();
  }

  function removeTodo(id) {
    state.todos = state.todos.filter((t) => t.id !== id);
    commit();
  }

  function setAllDone(done) {
    state.todos.forEach((t) => { t.done = done; });
    commit();
  }

  function clearCompleted() {
    state.todos = state.todos.filter((t) => !t.done);
    commit();
  }

  function startEditing(id) {
    state.editingId = id;
    render();
  }

  // 空文字で確定した場合はタスクを削除する
  function finishEditing(id, text, restoreFocus = false) {
    if (state.editingId !== id) return; // 既に確定/キャンセル済み
    state.editingId = null;
    if (restoreFocus) state.focusAfterRender = id;
    const title = normalizeTitle(text);
    if (!title) {
      removeTodo(id);
      return;
    }
    const todo = findTodo(id);
    if (todo) todo.title = title;
    commit();
  }

  function cancelEditing(id) {
    if (state.editingId !== id) return;
    state.editingId = null;
    state.focusAfterRender = id;
    render();
  }

  // ---------- 描画 ----------

  function iconButton(className, symbol, label) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `icon-btn ${className}`;
    btn.textContent = symbol;
    btn.setAttribute('aria-label', label);
    btn.title = label;
    return btn;
  }

  function renderItem(todo) {
    const li = document.createElement('li');
    li.className = 'todo-item';
    li.classList.toggle('done', todo.done);
    li.dataset.id = todo.id;

    if (state.editingId === todo.id) {
      li.classList.add('editing');
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'edit';
      input.value = todo.title;
      input.maxLength = MAX_LENGTH;
      input.setAttribute('aria-label', 'タスク名を編集(Enter で保存、Esc でキャンセル)');
      li.append(input);
      return li;
    }

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'toggle';
    checkbox.checked = todo.done;
    checkbox.setAttribute('aria-label', `「${todo.title}」を完了にする`);

    const title = document.createElement('span');
    title.className = 'title';
    title.textContent = todo.title;

    li.append(
      checkbox,
      title,
      iconButton('edit-btn', '✎', `「${todo.title}」を編集`),
      iconButton('delete-btn', '×', `「${todo.title}」を削除`),
    );
    return li;
  }

  function render() {
    const { todos, filter } = state;
    const visible = todos.filter(FILTERS[filter]);
    const remaining = todos.filter((t) => !t.done).length;
    const completed = todos.length - remaining;
    const hasTodos = todos.length > 0;

    el.list.replaceChildren(...visible.map(renderItem));

    el.toolbar.hidden = !hasTodos;
    el.footer.hidden = !hasTodos;
    el.empty.hidden = visible.length > 0;
    el.empty.textContent = !hasTodos
      ? 'タスクはまだありません。上の入力欄から追加しましょう。'
      : filter === 'active'
        ? '未完了のタスクはありません。お疲れさまでした!'
        : '完了済みのタスクはありません。';

    el.toggleAll.checked = hasTodos && remaining === 0;
    el.toggleAll.indeterminate = remaining > 0 && completed > 0;
    el.count.textContent = `残り ${remaining} 件 / 全 ${todos.length} 件`;
    el.clearCompleted.hidden = completed === 0;

    el.filterLinks.forEach((link) => {
      if (link.dataset.filter === filter) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    if (state.editingId) {
      const input = el.list.querySelector('.edit');
      if (input) {
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
      } else {
        state.editingId = null; // 編集中のタスクがフィルタで非表示になった
      }
    } else if (state.focusAfterRender) {
      const id = state.focusAfterRender;
      state.focusAfterRender = null;
      const target = el.list.querySelector(`[data-id="${CSS.escape(id)}"] .edit-btn`);
      (target || el.input).focus();
    }
  }

  // ---------- イベント ----------

  const idOf = (node) => node.closest('.todo-item')?.dataset.id;

  el.form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (addTodo(el.input.value)) el.input.value = '';
    el.input.focus();
  });

  el.toggleAll.addEventListener('change', (e) => setAllDone(e.target.checked));
  el.clearCompleted.addEventListener('click', clearCompleted);

  el.list.addEventListener('change', (e) => {
    if (e.target.matches('.toggle')) setDone(idOf(e.target), e.target.checked);
  });

  el.list.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = idOf(btn);
    if (btn.classList.contains('delete-btn')) removeTodo(id);
    else if (btn.classList.contains('edit-btn')) startEditing(id);
  });

  el.list.addEventListener('dblclick', (e) => {
    if (e.target.matches('.title')) startEditing(idOf(e.target));
  });

  el.list.addEventListener('keydown', (e) => {
    if (!e.target.matches('.edit')) return;
    if (e.isComposing || e.keyCode === 229) return; // 日本語入力の変換確定中は無視
    if (e.key === 'Enter') {
      e.preventDefault();
      finishEditing(idOf(e.target), e.target.value, true);
    } else if (e.key === 'Escape') {
      cancelEditing(idOf(e.target));
    }
  });

  // 編集欄からフォーカスが外れたら保存
  el.list.addEventListener('focusout', (e) => {
    if (e.target.matches('.edit')) finishEditing(idOf(e.target), e.target.value);
  });

  window.addEventListener('hashchange', () => {
    state.filter = readFilter();
    render();
  });

  // 別タブでの変更を反映
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    state.todos = loadTodos();
    render();
  });

  render();
})();
