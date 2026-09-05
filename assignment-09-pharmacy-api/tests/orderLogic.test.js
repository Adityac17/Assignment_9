const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  computeTotalAmount,
  isPrescriptionRequired,
  prescriptionNotesSatisfied,
  findInsufficientStock,
} = require('../controllers/orderLogic');

// ---- computeTotalAmount ----
test('computeTotalAmount sums quantity * unitPrice', () => {
  const items = [
    { quantity: 2, unitPrice: 10 },
    { quantity: 3, unitPrice: 5.5 },
  ];
  assert.equal(computeTotalAmount(items), 2 * 10 + 3 * 5.5); // 36.5
});

test('computeTotalAmount returns 0 for empty or invalid input', () => {
  assert.equal(computeTotalAmount([]), 0);
  assert.equal(computeTotalAmount(null), 0);
  assert.equal(computeTotalAmount(undefined), 0);
});

test('computeTotalAmount tolerates missing/NaN fields', () => {
  const items = [{ quantity: 2 }, { unitPrice: 10 }, {}];
  assert.equal(computeTotalAmount(items), 0);
});

// ---- isPrescriptionRequired ----
test('isPrescriptionRequired true when any medicine requires prescription', () => {
  assert.equal(
    isPrescriptionRequired([{ requiresPrescription: false }, { requiresPrescription: true }]),
    true
  );
});

test('isPrescriptionRequired false when none require prescription', () => {
  assert.equal(
    isPrescriptionRequired([{ requiresPrescription: false }, { requiresPrescription: false }]),
    false
  );
  assert.equal(isPrescriptionRequired([]), false);
});

// ---- prescriptionNotesSatisfied ----
test('prescriptionNotesSatisfied always ok when not required', () => {
  assert.equal(prescriptionNotesSatisfied(false, ''), true);
  assert.equal(prescriptionNotesSatisfied(false, undefined), true);
});

test('prescriptionNotesSatisfied requires non-empty notes when required', () => {
  assert.equal(prescriptionNotesSatisfied(true, ''), false);
  assert.equal(prescriptionNotesSatisfied(true, '   '), false);
  assert.equal(prescriptionNotesSatisfied(true, undefined), false);
  assert.equal(prescriptionNotesSatisfied(true, 'Dr. Rao, Rx #123'), true);
});

// ---- findInsufficientStock ----
test('findInsufficientStock returns first short item', () => {
  const lines = [
    { name: 'Paracetamol', requested: 2, available: 10 },
    { name: 'Amoxicillin', requested: 5, available: 3 },
  ];
  const short = findInsufficientStock(lines);
  assert.ok(short);
  assert.equal(short.name, 'Amoxicillin');
  assert.equal(short.requested, 5);
  assert.equal(short.available, 3);
});

test('findInsufficientStock returns null when all sufficient', () => {
  const lines = [
    { name: 'Paracetamol', requested: 2, available: 10 },
    { name: 'Vitamin C', requested: 1, available: 1 },
  ];
  assert.equal(findInsufficientStock(lines), null);
});

test('findInsufficientStock treats exact-match stock as sufficient', () => {
  assert.equal(findInsufficientStock([{ name: 'X', requested: 4, available: 4 }]), null);
});
