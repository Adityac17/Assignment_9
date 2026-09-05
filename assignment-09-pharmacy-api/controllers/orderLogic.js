/**
 * Pure, side-effect-free business logic for orders.
 *
 * These functions contain the rules that are hardest to get right (pricing,
 * prescription enforcement, stock sufficiency) and are deliberately kept free of
 * Express, Mongoose, and I/O so they can be unit-tested without a live database.
 * The controller wires these to real Mongoose documents.
 */

/**
 * Compute the total amount for a set of priced line items.
 * @param {Array<{quantity:number, unitPrice:number}>} items
 * @returns {number}
 */
function computeTotalAmount(items) {
  if (!Array.isArray(items)) return 0;
  return items.reduce((sum, item) => {
    const qty = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    return sum + qty * price;
  }, 0);
}

/**
 * Determine whether an order requires prescription notes.
 * True if ANY line item's medicine requires a prescription.
 * @param {Array<{requiresPrescription:boolean}>} medicines
 * @returns {boolean}
 */
function isPrescriptionRequired(medicines) {
  if (!Array.isArray(medicines)) return false;
  return medicines.some((m) => m && m.requiresPrescription === true);
}

/**
 * Validate that, when a prescription is required, non-empty notes were supplied.
 * @param {boolean} required
 * @param {string} notes
 * @returns {boolean} true if the prescription rule is satisfied.
 */
function prescriptionNotesSatisfied(required, notes) {
  if (!required) return true;
  return typeof notes === 'string' && notes.trim().length > 0;
}

/**
 * Detect the first line item whose requested quantity exceeds available stock.
 * @param {Array<{name?:string, requested:number, available:number}>} lines
 * @returns {{name:string, requested:number, available:number}|null} the short item, or null if all sufficient.
 */
function findInsufficientStock(lines) {
  if (!Array.isArray(lines)) return null;
  for (const line of lines) {
    const requested = Number(line.requested) || 0;
    const available = Number(line.available) || 0;
    if (requested > available) {
      return {
        name: line.name || 'unknown',
        requested,
        available,
      };
    }
  }
  return null;
}

module.exports = {
  computeTotalAmount,
  isPrescriptionRequired,
  prescriptionNotesSatisfied,
  findInsufficientStock,
};
