/**
 * Person deduplication utility — MCHVC-SPEC-001 v1.1 §45.1.
 *
 * Identity resolution reuses existing person records on confident match;
 * a new person is never created solely because spelling differs (§45.1).
 *
 * Checks across all local SQLite tables:
 *   - persons (full_name, date_of_birth, phone)
 *   - episodes (snapshot.woman_name for PREGNANCY module)
 *   - newborn_episodes (child_name, mother_name)
 *   - immunisation_children (child_name, cwc_card_number)
 *   - growth_measurements (child_name)
 */
import { query } from '../db/database';

export interface DedupMatch {
  matched: boolean;
  matchType: 'EXACT' | 'STRONG' | 'SOFT' | 'NONE';
  source: string;
  existingId?: string;
  existingName?: string;
  matchField?: string;
}

/**
 * Check if a woman/mother already exists in the local database.
 * Checks persons table, pregnancy episode snapshots, and newborn episode mother_name.
 */
export function checkWomanExists(
  fullName: string,
  dob?: string,
  phone?: string,
): DedupMatch {
  const name = fullName.trim().toLowerCase();
  if (!name) return { matched: false, matchType: 'NONE', source: '' };

  // 1. Check persons table — STRONG: name + DOB
  if (dob) {
    const rows = query(
      `SELECT id, full_name FROM persons WHERE LOWER(full_name) = ? AND date_of_birth = ? LIMIT 1`,
      [name, dob],
    );
    if (rows.length > 0) {
      return {
        matched: true,
        matchType: 'STRONG',
        source: 'persons',
        existingId: String(rows[0].id),
        existingName: String(rows[0].full_name),
        matchField: 'name+dob',
      };
    }
  }

  // 2. Check persons table — SOFT: name + phone
  if (phone) {
    const rows = query(
      `SELECT id, full_name FROM persons WHERE LOWER(full_name) = ? AND phone = ? LIMIT 1`,
      [name, phone],
    );
    if (rows.length > 0) {
      return {
        matched: true,
        matchType: 'SOFT',
        source: 'persons',
        existingId: String(rows[0].id),
        existingName: String(rows[0].full_name),
        matchField: 'name+phone',
      };
    }
  }

  // 3. Check persons table — name only (case-insensitive)
  const nameRows = query(
    `SELECT id, full_name FROM persons WHERE LOWER(full_name) = ? LIMIT 1`,
    [name],
  );
  if (nameRows.length > 0) {
    return {
      matched: true,
      matchType: 'SOFT',
      source: 'persons',
      existingId: String(nameRows[0].id),
      existingName: String(nameRows[0].full_name),
      matchField: 'name',
    };
  }

  // 4. Check pregnancy episode snapshots for woman_name
  const pregRows = query(
    `SELECT id, snapshot FROM episodes WHERE module = 'PREGNANCY' AND status = 'ACTIVE'`,
  );
  for (const row of pregRows) {
    try {
      const snap = JSON.parse(row.snapshot as string);
      const womanName = String(snap.woman_name ?? '').toLowerCase();
      if (womanName === name) {
        return {
          matched: true,
          matchType: 'STRONG',
          source: 'pregnancy_episode',
          existingId: String(row.id),
          existingName: String(snap.woman_name),
          matchField: 'woman_name',
        };
      }
    } catch { /* */ }
  }

  // 5. Check newborn_episodes for mother_name
  const nbRows = query(
    `SELECT id, mother_name FROM newborn_episodes WHERE LOWER(mother_name) = ? AND status = 'ACTIVE' LIMIT 1`,
    [name],
  );
  if (nbRows.length > 0) {
    return {
      matched: true,
      matchType: 'STRONG',
      source: 'newborn_episode',
      existingId: String(nbRows[0].id),
      existingName: String(nbRows[0].mother_name),
      matchField: 'mother_name',
    };
  }

  return { matched: false, matchType: 'NONE', source: '' };
}

/**
 * Check if a child already exists in the local database.
 * Checks persons, newborn_episodes, immunisation_children, and growth_measurements.
 */
export function checkChildExists(
  childName: string,
  dob?: string,
  cwcCardNumber?: string,
): DedupMatch {
  const name = childName.trim().toLowerCase();
  if (!name) return { matched: false, matchType: 'NONE', source: '' };

  // 1. Check immunisation_children by CWC card — EXACT
  if (cwcCardNumber) {
    const rows = query(
      `SELECT id, child_name FROM immunisation_children WHERE cwc_card_number = ? LIMIT 1`,
      [cwcCardNumber],
    );
    if (rows.length > 0) {
      return {
        matched: true,
        matchType: 'EXACT',
        source: 'immunisation_children',
        existingId: String(rows[0].id),
        existingName: String(rows[0].child_name),
        matchField: 'cwc_card_number',
      };
    }
  }

  // 2. Check immunisation_children by name + DOB
  if (dob) {
    const rows = query(
      `SELECT id, child_name FROM immunisation_children WHERE LOWER(child_name) = ? AND dob = ? LIMIT 1`,
      [name, dob],
    );
    if (rows.length > 0) {
      return {
        matched: true,
        matchType: 'STRONG',
        source: 'immunisation_children',
        existingId: String(rows[0].id),
        existingName: String(rows[0].child_name),
        matchField: 'name+dob',
      };
    }
  }

  // 3. Check immunisation_children by name only
  const immRows = query(
    `SELECT id, child_name FROM immunisation_children WHERE LOWER(child_name) = ? LIMIT 1`,
    [name],
  );
  if (immRows.length > 0) {
    return {
      matched: true,
      matchType: 'SOFT',
      source: 'immunisation_children',
      existingId: String(immRows[0].id),
      existingName: String(immRows[0].child_name),
      matchField: 'name',
    };
  }

  // 4. Check newborn_episodes by child_name
  const nbRows = query(
    `SELECT id, child_name FROM newborn_episodes WHERE LOWER(child_name) = ? AND status = 'ACTIVE' LIMIT 1`,
    [name],
  );
  if (nbRows.length > 0) {
    return {
      matched: true,
      matchType: 'STRONG',
      source: 'newborn_episodes',
      existingId: String(nbRows[0].id),
      existingName: String(nbRows[0].child_name),
      matchField: 'child_name',
    };
  }

  // 5. Check growth_measurements by child_name
  const growthRows = query(
    `SELECT DISTINCT child_name FROM growth_measurements WHERE LOWER(child_name) = ? LIMIT 1`,
    [name],
  );
  if (growthRows.length > 0) {
    return {
      matched: true,
      matchType: 'SOFT',
      source: 'growth_measurements',
      existingName: String(growthRows[0].child_name),
      matchField: 'child_name',
    };
  }

  // 6. Check persons table
  const personRows = query(
    `SELECT id, full_name FROM persons WHERE LOWER(full_name) = ? LIMIT 1`,
    [name],
  );
  if (personRows.length > 0) {
    return {
      matched: true,
      matchType: 'SOFT',
      source: 'persons',
      existingId: String(personRows[0].id),
      existingName: String(personRows[0].full_name),
      matchField: 'name',
    };
  }

  return { matched: false, matchType: 'NONE', source: '' };
}

/**
 * Check if a mother-child pair already exists.
 * Useful for newborn registration to prevent duplicate mother-child pairs.
 */
export function checkMotherChildPairExists(
  motherName: string,
  childName: string,
): DedupMatch {
  const mother = motherName.trim().toLowerCase();
  const child = childName.trim().toLowerCase();
  if (!mother || !child) return { matched: false, matchType: 'NONE', source: '' };

  // Check newborn_episodes for matching mother_name + child_name
  const rows = query(
    `SELECT id, child_name, mother_name FROM newborn_episodes
     WHERE LOWER(mother_name) = ? AND LOWER(child_name) = ? LIMIT 1`,
    [mother, child],
  );
  if (rows.length > 0) {
    return {
      matched: true,
      matchType: 'EXACT',
      source: 'newborn_episodes',
      existingId: String(rows[0].id),
      existingName: `${rows[0].mother_name} → ${rows[0].child_name}`,
      matchField: 'mother+child pair',
    };
  }

  return { matched: false, matchType: 'NONE', source: '' };
}
