# PG DDL INTERPRETER

## Initial specification
  - I want to create a generator of webapps 
  - Which would use the DDL extracted from a postgres instance 
    - Taking as input: hostname,port,dbname,dbpass 
  - To create a full standalone webapp 
    - Implementing CURD interactions for each table in the DDL 
    - Simple styling  
  - Containing one dynamic webpage for each table in the DDL 
    - with a partial listing of the rows in the table 
    - interactively paging rows up and down 
  - With options for interactively modify, create or delete any row 
  - With gui elements to report errors from the database

## Problems 
```
[error] Error: SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string 
     at /home/artejera/Documents/trae_projects/HotY/test-output/node_modules/pg-pool/index.js:45:11 
     at process.processTicksAndRejections (node:internal/process/task_queues:95:5) 
     at async listRows (/home/artejera/Documents/trae_projects/HotY/test-output/db.js:59:18) 

We are getting an error: 
     Rows in orders 
     Failed to load rows 
     SASL: SCRAM-SERVER-FIRST-MESSAGE: client password must be a string
 ```
## Other requests
  - Can we interact with the tables of a database schema without generating specific code
    - implementing an interpreter of the DDL , 
    - and also be able to re-enter the credentials page at any moment ?

  - how can i get an itemized specification of this project ?

  - can we remove the 'generator' feature and leave only 'interpreter' ?
do not automatically erase files with extensions .md or .sql [ also not extension .sh ]

## MASTER-DETAIL
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

## Other requests
  - select table within chosen schema with a table selector, next to the schema selector
  - visually distinguish key fields of current table
  - use ui-tooltips to provide info on data type and nullable labels

## Authentication and Authorization: 
``` commit c38615258b6d74f8725cbf1b1cc9311a93607559 (HEAD -> main, origin/main) ```
  - user/pass authentication, 
    - implement user table independent of the database credentials:
      - username 
      - password (stored with one-way-encription) 
      - role 
        - 'admin' is able to edit any user and any field 
        - 'normal' can only edit its own password 
  - ***TODO***:  revert authentication to database credentials, discard user table
    - ***TODO***:  display user in page header, along with software version and today's date&time
    - ***TODO***:  enable user to log out
    - ***TODO***: enable user complete name stored in pg user description
    - ***TODO***:  enable user to change its password and its name(description)
## Other requests
  - enable a database schema selector (UI) 
  - define and display a software version timestamp: 
    - format yymmdd.hhmm 
  - update SPECIFICATION.md 
<hr/><hr/><hr/><br/>

# PLANS

## PLAN: Back/Escape, Submit/Accept, Cancel/Interrupt buttons
  Navigation buttons, shown in predictable locations:
  - Plan for a button that opens a transaction (sql begin), and enables 'write' mode
  - Enable a 'transaction' state of the connection
    - when no transaction is active, 
      - the operators can't modify/create/delete any data
      - They may browse freely
      - They may turn on the transaction state
        - and later cancell the 
  - Plan for a button that may be used to pop states without cancelling current transaction
    - pop 'searching' state of table browser
    - pop cancel search form of table browser
    - pop detail table browser and return to its master table browser
    - pop cancel edit form of table browser
    - its final base state is the connected state with selection of schema and table
  - Plan for a button that would suspend/interrupt the current transaction
  - Plan for a button that would commit the current transaction
    - report commit failure
  
## PLAN SQL EXPRESSIONS and DECORATIONS:
  - sql-expression execution
  - sql-expression catalog
  - sql-expression 

<hr/><hr/><hr/><br/>


# STILL ***TODO***

## TO-DO further master-detail
- enable nested master-detail, so for example, if you may have:
  - a master table 'countries' with key 'country_id'
  - a detail table 'federated states' with keys 'country_id', 'state_id'
  - a detail table 'counties' with keys 'country_id', 'state_id', 'county_id'
- enable alternate master-detail, so for example, if you may have:
  - a master table 'countries' with key 'country_id'
  - a detail table 'federated states' with keys 'country_id', 'state_id'
  - an alternate detail table 'sales region' with keys 'country_id', 'region_id'

## Drill-down on foreign keys

  - For cases of a table browser, displaying a field refering to a foreign key, and only for the case of the least significant key of the foreign table
    - enable drill-down to a form displaying more fields of the foreign tuple, read-only. 


  - For cases of a form, displaying a field refering to a foreign key, and only for the case of the least significant key of the foreign table
    - enable exploration through a table browser on the foreign table, read-only. 
    - enable value selection of the form's origin field, selectiong on the displayed table browser.

## TO-DO search form
  The table browser displays will have an extra state: 'searching', with a special button, which:
  - will cause the table browser to enter the 'searching' state
  - will cause the display of a search form
    - with the same fields of a normal form
    - with its field values initialized to blanks, so that the user can input search criteria,
    - The search values understand patterns similar to sql's 'like'.
  - When the user submits the search form
    - the base table browser is filtered to show only the rows whose values match the search criteria.
    - When the user cancels the search, then the table browser is reset to show all rows, and the 'searching' state is exited.
  - if the base table browser is a 'detail table', the key fields fixed by its relation to its 'master table', are not searchable.

## TODO: LIMITS
    report an error if a limit is exceeded
  - maximum number of rows displayed in a table browser is 1000
  - maximum time to execute a query is 10 seconds
  - maximum time to hold a transaction state is 1 hours
<hr/><hr/>