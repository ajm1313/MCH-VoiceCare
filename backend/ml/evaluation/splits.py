"""
Evaluation split design (spec §30.2).

Required split design:
  - split by woman and pregnancy (no woman in both train and test);
  - hold out whole facilities or regions;
  - include a later temporal holdout;
  - use identical splits for all comparator models.

All comparators MUST use identical splits (spec §13.5, §30.2).
"""
from typing import Dict, List, Tuple, Optional, Any
import numpy as np


def split_by_woman(df: Dict[str, list],
                   woman_col: str = "woman_id",
                   test_frac: float = 0.2,
                   random_state: int = 42) -> Tuple[Dict[str, list], Dict[str, list]]:
    """Split data so no woman appears in both train and test (spec §30.2).

    Args:
        df: dict mapping column name -> list of values (acts like a dataframe)
        woman_col: column identifying unique women
        test_frac: fraction of women to hold out
        random_state: random seed for reproducibility

    Returns:
        (train_dict, test_dict) — each has the same columns as input.
    """
    rng = np.random.RandomState(random_state)
    woman_ids = list(set(df[woman_col]))
    woman_ids_arr = np.array(woman_ids)
    rng.shuffle(woman_ids_arr)
    woman_ids = woman_ids_arr.tolist()
    n_test = int(len(woman_ids) * test_frac)
    test_women = set(woman_ids[:n_test])

    columns = list(df.keys())
    n = len(df[woman_col])
    train_mask = [df[woman_col][i] not in test_women for i in range(n)]
    test_mask = [df[woman_col][i] in test_women for i in range(n)]

    train = {col: [df[col][i] for i in range(n) if train_mask[i]] for col in columns}
    test = {col: [df[col][i] for i in range(n) if test_mask[i]] for col in columns}
    return train, test


def split_by_facility(df: Dict[str, list],
                      holdout_facilities: List[str],
                      facility_col: str = "facility_id") -> Tuple[Dict[str, list], Dict[str, list]]:
    """Hold out whole facilities for external validation (spec §30.2).

    Args:
        df: dict mapping column name -> list of values
        holdout_facilities: list of facility IDs to hold out
        facility_col: column identifying facilities

    Returns:
        (train_dict, test_dict)
    """
    holdout_set = set(holdout_facilities)
    columns = list(df.keys())
    n = len(df[facility_col])
    train_mask = [df[facility_col][i] not in holdout_set for i in range(n)]
    test_mask = [df[facility_col][i] in holdout_set for i in range(n)]

    train = {col: [df[col][i] for i in range(n) if train_mask[i]] for col in columns}
    test = {col: [df[col][i] for i in range(n) if test_mask[i]] for col in columns}
    return train, test


def split_temporal(df: Dict[str, list],
                   cutoff_date: str,
                   date_col: str = "date") -> Tuple[Dict[str, list], Dict[str, list]]:
    """Temporal holdout — train on earlier data, test on later (spec §30.2).

    Args:
        df: dict mapping column name -> list of values
        cutoff_date: ISO date string (YYYY-MM-DD); rows >= cutoff go to test
        date_col: column containing ISO date strings

    Returns:
        (train_dict, test_dict)
    """
    columns = list(df.keys())
    n = len(df[date_col])
    train_mask = [df[date_col][i] < cutoff_date for i in range(n)]
    test_mask = [df[date_col][i] >= cutoff_date for i in range(n)]

    train = {col: [df[col][i] for i in range(n) if train_mask[i]] for col in columns}
    test = {col: [df[col][i] for i in range(n) if test_mask[i]] for col in columns}
    return train, test


def create_identical_splits(df: Dict[str, list],
                            comparators: Optional[list] = None,
                            woman_col: str = "woman_id",
                            test_frac: float = 0.2,
                            random_state: int = 42) -> Dict[str, Tuple[Dict[str, list], Dict[str, list]]]:
    """Ensure all comparators use identical splits (spec §13.5, §30.2).

    Computes the split once and returns the same (train, test) pair for each
    comparator. This guarantees no comparator gets an information advantage
    from a different split.

    Args:
        df: dict mapping column name -> list of values
        comparators: list of comparator objects (or names). If None, uses
            ["elastic_net", "ebm", "xgboost"].
        woman_col: column identifying unique women
        test_frac: fraction of women to hold out
        random_state: random seed

    Returns:
        Dict mapping comparator name -> (train_dict, test_dict).
        All values are the SAME split.
    """
    train, test = split_by_woman(df, woman_col=woman_col,
                                 test_frac=test_frac, random_state=random_state)

    if comparators is None:
        comparator_names = ["elastic_net", "ebm", "xgboost"]
    else:
        comparator_names = [getattr(c, "name", str(c)) for c in comparators]

    return {name: (train, test) for name in comparator_names}
