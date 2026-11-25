'use strict';

const { validateStudent, validateStatusChange } = require('./validation');
const { NotFoundError, ConflictError } = require('./errors');

function createStudentService(repository) {
  function requireStudent(id) {
    const student = repository.get(id);
    if (!student) throw new NotFoundError(id);
    return student;
  }

  function assertEmailFree(email, ownId) {
    const other = repository.findByEmail(email);
    if (other && other.id !== ownId) throw new ConflictError();
  }

  return {
    create(input) {
      const data = validateStudent(input, { acceptStatus: true });
      assertEmailFree(data.email);
      return repository.create(data);
    },

    list: () => repository.list(),

    get: (id) => requireStudent(id),

    update(id, input) {
      requireStudent(id);
      const data = validateStudent(input);
      assertEmailFree(data.email, id);
      return repository.update(id, data);
    },

    setStatus(id, input) {
      requireStudent(id);
      return repository.setStatus(id, validateStatusChange(input));
    },

    remove(id) {
      requireStudent(id);
      repository.remove(id);
    },
  };
}

module.exports = { createStudentService };
