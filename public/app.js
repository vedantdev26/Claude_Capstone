'use strict';

class ApiError extends Error {
  constructor(status, error) {
    super(error.message);
    this.status = status;
    this.code = error.code;
    this.fields = error.fields || [];
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

  function showMessage(text, type) {
    clearTimeout(messageTimer);
    message.textContent = text;
    message.className = `alert ${type}`;
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
      students = await api.list();
    } catch (err) {
      showMessage(err.message, 'error');
      resultCount.textContent = 'Could not load students';
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

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();
    clearFieldErrors();
    const data = { name: inputs.name.value, email: inputs.email.value, course: inputs.course.value };
    const wasEditing = editingId !== null;
    submitButton.disabled = true;
    try {
      if (wasEditing) await api.update(editingId, data);
      else await api.create(data);
    } catch (err) {
      handleSaveError(err, wasEditing);
      submitButton.disabled = false;
      return;
    }
    submitButton.disabled = false;
    resetForm();
    showMessage(wasEditing ? 'Student updated.' : 'Student added.', 'success');
    await load();
  });

  function handleSaveError(err, wasEditing) {
    if (!(err instanceof ApiError)) {
      showMessage('Unexpected error. Please try again.', 'error');
      return;
    }
    if (err.code === 'VALIDATION_ERROR') {
      for (const { field, message: text } of err.fields) {
        if (field in inputs) setFieldError(field, text);
      }
      showMessage('Please correct the highlighted fields.', 'error');
    } else if (err.code === 'CONFLICT') {
      setFieldError('email', err.message);
      showMessage(err.message, 'error');
    } else if (err.code === 'NOT_FOUND' && wasEditing) {
      resetForm();
      showMessage(`${err.message}. It may have been deleted.`, 'error');
      load();
    } else {
      showMessage(err.message, 'error');
    }
  }

  cancelEdit.addEventListener('click', () => {
    clearMessage();
    resetForm();
    render();
  });

  search.addEventListener('input', render);

  body.addEventListener('click', (event) => {
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

  dialog.addEventListener('close', async () => {
    const student = pendingDelete;
    pendingDelete = null;
    if (!student || dialog.returnValue !== 'confirm') return;
    clearMessage();
    try {
      await api.remove(student.id);
    } catch (err) {
      showMessage(err instanceof ApiError ? err.message : 'Unexpected error. Please try again.', 'error');
      if (err.code === 'NOT_FOUND') await load();
      return;
    }
    if (editingId === student.id) resetForm();
    showMessage(`Deleted ${student.name}.`, 'success');
    await load();
  });

  load();
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ApiError, createApi, filterStudents };
} else {
  initDashboard(document, createApi((...args) => fetch(...args), '/students'));
}
