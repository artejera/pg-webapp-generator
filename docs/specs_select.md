# SELECT statements

## Parsing
- figure out primary table
  - figure out primary keys
    - check that no key is missing
  - figure out references from & to other tables
  - figure out foreign keys
- figure out left join tables
  - mark joined fields as non-editable
- fail on other join types

## Execution
- update/delete/insert on primary table
- *beware* some views are updatable
- update left join table display
  - update joined fields

## Large table size
- pg_class.reltuples