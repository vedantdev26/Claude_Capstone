'use strict';

class ApiError extends Error {
  constructor(status, error) {
    super(error.message || 'Request failed');
    this.status = status;
    this.code = error.code;
    this.fields = Array.isArray(error.fields) ? error.fields : [];
  }
}

function createApi(fetchFn, base) {
  async function call(method, id, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    let res;
    try {
      res = await fetchFn(id === undefined ? base : `${base}/${id}`, options);
    } catch {
      throw new ApiError(0, { code: 'NETWORK_ERROR', message: 'Cannot reach the server. Check that it is running.' });
    }
    if (res.status === 204) return null;
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      payload = null;
    }
    if (!res.ok) {
      throw new ApiError(res.status, payload?.error ?? { code: 'HTTP_ERROR', message: `Request failed (${res.status})` });
    }
    if (payload === null) {
      throw new ApiError(res.status, { code: 'BAD_RESPONSE', message: 'Unexpected response from the server.' });
    }
    return payload;
  }
  return {
    list: () => call('GET'),
    create: (student) => call('POST', undefined, student),
    update: (id, student) => call('PUT', id, student),
    remove: (id) => call('DELETE', id),
  };
}

function filterStudents(students, query) {
  const q = String(query).trim().toLowerCase();
  if (!q) return students;
  return students.filter((s) => [s.name, s.email, s.course].some((value) => String(value).toLowerCase().includes(q)));
}

function initDashboard(doc, api) {
  const $ = (id) => doc.getElementById(id);
  const form = $('student-form');
  const inputs = { name: $('name'), email: $('email'), course: $('course') };
  const submitButton = $('submit-button');
  const cancelEdit = $('cancel-edit');
  const formTitle = $('form-title');
  const message = $('message');
  const search = $('search');
  const body = $('students-body');
  const tableWrap = $('table-wrap');
  const emptyState = $('empty-state');
  const resultCount = $('result-count');
  const totalCount = $('total-count');
  const dialog = $('confirm-dialog');
  const confirmText = $('confirm-text');

  let students = [];
  let editingId = null;
  let pendingDelete = null;
  let messageTimer = null;
  let busy = false;

  async function guarded(task) {
    if (busy) return;
    busy = true;
    submitButton.disabled = true;
    try {
      await task();
    } finally {
      busy = false;
      submitButton.disabled = false;
    }
  }

  function showMessage(text, type) {
    clearTimeout(messageTimer);
    message.textContent = text;
    message.className = `alert ${type}`;
    message.setAttribute('role', type === 'error' ? 'alert' : 'status');
    message.hidden = false;
    if (type === 'success') messageTimer = setTimeout(clearMessage, 5000);
  }

  function clearMessage() {
    clearTimeout(messageTimer);
    message.hidden = true;
    message.textContent = '';
  }

  function setFieldError(field, text) {
    const el = $(`error-${field}`);
    el.textContent = text || '';
    el.hidden = !text;
    if (text) inputs[field].setAttribute('aria-invalid', 'true');
    else inputs[field].removeAttribute('aria-invalid');
  }

  function clearFieldErrors() {
    Object.keys(inputs).forEach((field) => setFieldError(field, ''));
  }

  function cell(tr, label, text, className) {
    const td = doc.createElement('td');
    td.setAttribute('role', 'cell');
    td.dataset.label = label;
    td.textContent = text;
    if (className) td.className = className;
    tr.appendChild(td);
    return td;
  }

  function actionButton(label, action, extraClass) {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = `btn btn-small ${extraClass}`;
    button.dataset.action = action;
    button.textContent = label;
    return button;
  }

  function render() {
    const visible = filterStudents(students, search.value);
    totalCount.textContent = String(students.length);
    body.replaceChildren();
    for (const student of visible) {
      const tr = doc.createElement('tr');
      tr.setAttribute('role', 'row');
      tr.dataset.id = String(student.id);
      if (student.id === editingId) tr.className = 'editing';
      cell(tr, 'ID', String(student.id));
      cell(tr, 'Name', student.name);
      cell(tr, 'Email', student.email);
      cell(tr, 'Course', student.course);
      const actions = cell(tr, 'Actions', '', 'actions');
      actions.append(actionButton('Edit', 'edit', 'btn-secondary'), actionButton('Delete', 'delete', 'btn-danger'));
      body.appendChild(tr);
    }
    tableWrap.hidden = visible.length === 0;
    if (students.length === 0) {
      emptyState.textContent = 'No students yet. Add the first one using the form.';
      emptyState.hidden = false;
      resultCount.textContent = '0 students';
    } else if (visible.length === 0) {
      emptyState.textContent = 'No students match your search.';
      emptyState.hidden = false;
      resultCount.textContent = `Showing 0 of ${students.length}`;
    } else {
      emptyState.hidden = true;
      resultCount.textContent = visible.length === students.length
        ? `${students.length} ${students.length === 1 ? 'student' : 'students'}`
        : `Showing ${visible.length} of ${students.length}`;
    }
  }

  async function load() {
    try {
      const list = await api.list();
      if (!Array.isArray(list)) throw new ApiError(200, { code: 'BAD_RESPONSE', message: 'Unexpected response from the server.' });
      students = list;
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : 'Could not load students.', 'error');
      resultCount.textContent = 'Could not load students. Reload the page to try again.';
      return;
    }
    render();
  }

  function resetForm() {
    editingId = null;
    form.reset();
    clearFieldErrors();
    formTitle.textContent = 'Add Student';
    submitButton.textContent = 'Add Student';
    cancelEdit.hidden = true;
  }

  function startEdit(student) {
    clearMessage();
    clearFieldErrors();
    editingId = student.id;
    inputs.name.value = student.name;
    inputs.email.value = student.email;
    inputs.course.value = student.course;
    formTitle.textContent = `Edit Student #${student.id}`;
    submitButton.textContent = 'Save Changes';
    cancelEdit.hidden = false;
    render();
    inputs.name.focus();
  }

  function focusFirstInvalid() {
    const first = Object.keys(inputs).find((field) => !$(`error-${field}`).hidden);
    if (first) inputs[first].focus();
  }

  function handleSaveError(err, wasEditing) {
    if (!(err instanceof ApiError)) {
      showMessage('Unexpected error. Please try again.', 'error');
      return;
    }
    if (err.code === 'VALIDATION_ERROR') {
      let highlighted = 0;
      for (const { field, message: text } of err.fields) {
        if (Object.hasOwn(inputs, field)) {
          setFieldError(field, text);
          highlighted += 1;
        }
      }
      showMessage(highlighted > 0 ? 'Please correct the highlighted fields.' : err.message, 'error');
      focusFirstInvalid();
    } else if (err.code === 'CONFLICT') {
      setFieldError('email', err.message);
      showMessage('Could not save: that email belongs to another student.', 'error');
      focusFirstInvalid();
    } else if (err.code === 'NOT_FOUND' && wasEditing) {
      resetForm();
      showMessage(`${err.message}. It may have been deleted.`, 'error');
      load();
    } else {
      showMessage(err.message, 'error');
    }
  }

  async function save() {
    clearMessage();
    clearFieldErrors();
    const data = { name: inputs.name.value, email: inputs.email.value, course: inputs.course.value };
    const wasEditing = editingId !== null;
    try {
      if (wasEditing) await api.update(editingId, data);
      else await api.create(data);
    } catch (err) {
      handleSaveError(err, wasEditing);
      return;
    }
    resetForm();
    showMessage(wasEditing ? 'Student updated.' : 'Student added.', 'success');
    await load();
  }

  async function removeStudent(student) {
    clearMessage();
    try {
      await api.remove(student.id);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'NOT_FOUND') {
        showMessage(`${student.name} was already deleted.`, 'success');
        await load();
      } else {
        showMessage(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.', 'error');
      }
      return;
    }
    if (editingId === student.id) resetForm();
    showMessage(`Deleted ${student.name}.`, 'success');
    await load();
    search.focus();
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    guarded(save);
  });

  cancelEdit.addEventListener('click', () => {
    if (busy) return;
    clearMessage();
    resetForm();
    render();
  });

  search.addEventListener('input', render);

  body.addEventListener('click', (event) => {
    if (busy) return;
    const button = event.target.closest('button[data-action]');
    if (!button) return;
    const id = Number(button.closest('tr').dataset.id);
    const student = students.find((s) => s.id === id);
    if (!student) return;
    if (button.dataset.action === 'edit') {
      startEdit(student);
    } else {
      pendingDelete = student;
      confirmText.textContent = `Delete ${student.name} (${student.email})? This cannot be undone.`;
      dialog.returnValue = '';
      dialog.showModal();
    }
  });

  dialog.addEventListener('close', () => {
    const student = pendingDelete;
    pendingDelete = null;
    if (student && dialog.returnValue === 'confirm') guarded(() => removeStudent(student));
  });

  load();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiError, createApi, filterStudents };
} else {
  initDashboard(document, createApi((...args) => fetch(...args), '/students'));
}
