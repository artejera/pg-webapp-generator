NEXT PROJECT TASK 

- implement master table and a detail table
  - the detail table has more than one key
  - the master table contains all the keys of the detail table, excepting the last one
  - when the master table is being browsed 
    - a master table ui-row may be selected to become a ui-header
      - only one row of the master table may be selected this way
      - other rows of the master table are henceforth excluded from the webpage presentation
      - the selected master table row cannot be edited (modified, deleted) while it remains in master-table state
    - a subordinate table row browser, for the detail table, is shown under to the master table ui-header
    - the range of rows shown in the detail table are constraind to those rows whose keys match the corresponding columns of the master table row selected

- select table within chosen schema with a table selector, next to the schema selector
- visually distinguish key fields of current table
- use smaller font for data type and nullable labels

TO-DO search widget

TO-DO SQL EXPRESSIONS:
- sql-expression execution
- sql-expression catalog
- sql-expression 

=========== 

=========== commit c38615258b6d74f8725cbf1b1cc9311a93607559 (HEAD -> main, origin/main) =======
Please do this: 
 - user/pass authentication, 
   - user table  
     - username 
     - password (stored with one-way-encription) 
     - role 
       - 'admin' is able to edit any user and any field 
       - 'normal' can only edit its own password 
 - enable a database schema selector (UI) 
 - define and display a software version timestamp: 
   - format yymmdd.hhmm 
 - update SPECIFICATION.md 
 - report the time elapsed doing this task 
 ==============================================================================================
