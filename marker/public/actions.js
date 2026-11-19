for (const block of document.querySelectorAll('.copy-wrap')) {
  const field = block.querySelector('[data-copy-value]');
  const status = block.querySelector('[data-copy-status]');
  block.querySelector('[data-copy]').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(field.value);
      status.textContent = 'Ссылка скопирована';
    } catch {
      field.focus();
      field.select();
      status.textContent = 'Ссылка выделена. Скопируй её с клавиатуры.';
    }
  });
}

const assignment = document.querySelector('[data-assignment]');
if (assignment) {
  const updateCount = () => {
    const count = assignment.querySelectorAll('input[name="task"]:checked').length;
    assignment.querySelector('[data-count]').textContent = `Выбрано ${count} из 20`;
  };
  assignment.addEventListener('change', updateCount);
  addEventListener('pageshow', updateCount);
}

const form = document.querySelector('[data-autosave]');
if (form) {
  const status = form.querySelector('[data-save-status]');
  const retry = form.querySelector('[data-retry]');
  const revision = form.elements.revision;
  let timer;
  let inFlight;
  let dirty = false;
  let leaving = false;
  let conflict = false;

  function showStatus(text, error = false) {
    status.textContent = text;
    status.classList.toggle('late', error);
  }

  function save() {
    if (inFlight || !dirty || conflict) return inFlight;
    clearTimeout(timer);
    dirty = false;
    const body = new URLSearchParams(new FormData(form));
    showStatus('Сохраняю…');
    retry.hidden = true;
    inFlight = (async () => {
      let saved = false;
      try {
        const response = await fetch(location.pathname, {
          method: 'POST', body, headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000),
        });
        const result = await response.json();
        if (result.state === 'conflict' || result.state === 'submitted') {
          conflict = true;
          showStatus(result.state === 'conflict'
            ? 'Ответ изменился в другом окне. Нажми кнопку перехода, чтобы проверить свой ввод.'
            : 'Эта работа уже сдана. Нажми кнопку перехода, чтобы открыть итог.', true);
          return false;
        }
        if (!response.ok || !Number.isInteger(result.revision)) throw new Error('save failed');
        revision.value = result.revision;
        saved = true;
        showStatus(dirty ? 'Сохраняю…' : 'Черновик сохранён');
        return true;
      } catch {
        dirty = true;
        retry.hidden = false;
        showStatus('Ответ пока не сохранён.', true);
        return false;
      } finally {
        inFlight = null;
        if (saved && dirty && !leaving) void save();
      }
    })();
    return inFlight;
  }

  form.addEventListener('input', event => {
    if (event.target === revision) return;
    dirty = true;
    if (conflict) return;
    showStatus('Сохраняю…');
    clearTimeout(timer);
    timer = setTimeout(save, event.target.type === 'radio' ? 0 : 380);
  });
  retry.addEventListener('click', save);

  form.addEventListener('submit', async event => {
    if (leaving) {
      event.preventDefault();
      return;
    }
    if (!inFlight) return;
    event.preventDefault();
    const submitter = event.submitter;
    leaving = true;
    clearTimeout(timer);
    await inFlight;
    leaving = false;
    form.requestSubmit(submitter);
  });

  for (const link of document.querySelectorAll('.task-bar a')) {
    link.addEventListener('click', async event => {
      if ((!inFlight && !dirty && !conflict) || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      while (!conflict && (inFlight || dirty)) {
        if (!await (inFlight || save())) return;
      }
      if (!conflict) location.assign(link.href);
    });
  }
  addEventListener('beforeunload', event => {
    if (!dirty && !inFlight && !conflict) return;
    event.preventDefault();
    event.returnValue = true;
  });
  form.addEventListener('submit', event => {
    if (event.defaultPrevented) return;
    clearTimeout(timer);
    dirty = false;
    conflict = false;
  });
}
