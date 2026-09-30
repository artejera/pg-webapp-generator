=========== 
 ## I want to create a generator of webapps 
 ## Which would use the DDL extracted from a postgres instance 
 ### Taking as input: hostname,port,dbname,dbpass 
 ## To create a full standalone webapp 
 ### Implementing CURD interactions for each table in the DDL 
 ### Simple styling  
 ## Containing one dynamic webpage for each table in the DDL 
 ### with a partial listing of the rows in the table 
 ### interactively paging rows up and down 
 ## With options for interactively modify, create or delete any row 
 ## With gui elements to report errors from the database
 =========== 
 we are getting this problem 
 
 [error] Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string 
     at /home/artejera/Documents/trae_projects/HotY/test-output/node_modules/pg-pool/index.js:45:11 
     at process.processTicksAndRejections (node:internal/process/task_queues:95:5) 
     at async listRows (/home/artejera/Documents/trae_projects/HotY/test-output/db.js:59:18) 
 what are we doing now ?
 =========== 
-- we are getting an error: 
 Rows in orders 
 Failed to load rows 
 SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
=========== 
another request, can we interact with the tables of a database schema without generating specific code, implementing an interpreter of the DDL , and also be able to re-enter the credentials page at any moment ?
=========== 
how can i get an itemized specification of this project ?
=========== 
can we remove the 'generator' feature and leave only 'interpreter' ?
=========== 
do not automatically erase files with extensions .md or .sql [ also not extension .sh ]
=========== 
MASTER-DETAIL
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
- use ui-tooltips to provide info on data type and nullable labels

STILL TODO

TO-DO search widget

TO-DO SQL EXPRESSIONS:
- sql-expression execution
- sql-expression catalog
- sql-expression 
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
