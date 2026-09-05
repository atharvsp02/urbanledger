ALTER TABLE app.budgets
  ADD CONSTRAINT budgets_date_range_check CHECK ("endsOn" >= "startsOn"),
  ADD CONSTRAINT budgets_revision_positive_check CHECK (revision > 0);

ALTER TABLE app.budget_lines
  ADD CONSTRAINT budget_lines_planned_amount_non_negative_check CHECK ("plannedAmount" >= 0);
