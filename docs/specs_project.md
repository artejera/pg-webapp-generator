# PG DDL INTERPRETER

## GLOBALS
 - do not automatically erase files with extensions .md or .sql or .sh
 - do not automatically erase files at folders 'docs/' or 'bin/'

## Initial specification
- I want to have a webapp 
- Which would use the DDL extracted from a postgres instance 
- Implementing CURD interactions for each table 
- Pure interpreter, don't generate any code

### LOGIN DIALOG
- Presenting an initial dialog for username,hostname,port,dbname,dbpass
- - with a partial listing of the rows in the table 
  - interactively paging rows up and down 
  - With options for interactively modify, create or delete any row 

## PAGE HEADER
- Present used credentials (minus passwd) at webpage header
- Present database schema selector (UI) and schema selector (UI)
- define and display a software version timestamp (formatted as yymmdd.hhmm)
- Present logout/disconnect button, which will 
  - disconnect the user from the database instance
  - close all ui objects and re-enter the initial dialog for username,hostname,port,dbname,dbpass

## SIDE BAR
- Do not Present a left side bar, or a right side bar

## BROWSER TABLE
  - Mark an error if the selected table has no keys
  - Generate pop-ups to report any error
  - visually distinguish key fields of current table
  - use ui-tooltips in the table headers to provide info on data type and nullable labels
  - Prepend an 'actions' column to contain each row's buttons: edit, delete, use as 'master table row'
    - These 'buttons' are clickable 'icons', and may have tooltips to provide info on their function
  - The actions column of the headers of the browser table has the 'cancel' button, 
    - which will close its browser

## MASTER-DETAIL
- implement ui design and interactions to implement the master-detail relationship between tables
  - the detail table has all the keys of its master table, plus at least one more, which complete its own key set
  - when the master table is being browsed (before activating its detail table): 
    - a master table row may be selected to become the master row  of the 'detail table'
      - the 'detail table' is then activated, and shown under to the master table ui-header
      - only one row of the master table may be selected this way
      - other rows of the master table are henceforth excluded from the webpage presentation
      - the selected master table row cannot be edited (modified, deleted) while it remains in master-table state
    - a subordinate table row browser, for the detail table, is shown under to the master table ui-header
    - the range of rows shown in the detail table are constraind to those rows whose keys match the corresponding columns of the master table row selected

### further master-detail
- enable nested master-detail, so for example, if you may have:
  - a master table 'countries' with key 'country_id'
  - a detail table 'federated states' with keys 'country_id', 'state_id'
  - a nested detail table 'counties' with keys 'country_id', 'state_id', 'county_id'
- enable alternate master-detail, so for example, if you may have:
  - a master table 'countries' with key 'country_id'
  - a alternate detail table 'federated states' with keys 'country_id', 'state_id'
  - an alternate detail table 'sales region' with keys 'country_id', 'region_id'


## STARTED search form
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
- Regarding displayed browser/forms/search-stuff currently operating, please make sure that all these are destroyed if the operator changes table or schema.

## STARTED: LIMITS
report an error if a limit is exceeded
- maximum number of rows displayed in a table browser is 1000
- maximum time to execute a query is 10 seconds

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
- maximum time to hold a transaction state is 1 hours
  
## PLAN SQL EXPRESSIONS and DECORATIONS:
- sql-expression execution
- sql-expression catalog
- sql-expression 

<hr/><hr/><hr/><br/>

# DONE 2026-10-03
- Can we Show HotX version in connection dialog
- Can we check the posibility of setting 'TXN' state automatically if a 'create/modify/delete' button is ever pressed.
- Can we activate automatically the 'rollback' button if we ever get a postgres error, which would, anyway, destroy the current TXN?
- Please: when a table row in a browser is marked as 'master table row', and the 'detail table' browser is being shown, then please hide the un-selected sibling rows of the 'master table'. Show again the siblings when the 'master table row' is unmarked.
- Please: when the form with a row selected for edition is shown, please show the edit form and hide its table browser.
- Please: in a form, and in a browser, in the column labels, please remove the data-type info and present them as tooltips.
- Please: create another icon-button in the web page header with would show a map of the foreign-key relations between the tables of the selected schema, in a popup window, in a simple graphical form.
- Please: can you upgrade the header items of the table browser, adding a multi-state icon-control, so that they represent the 'sort' state of the column: none, ascending, descending ? And , of course, when the user clicks on the control, the table browser is sorted accordingly.

# DONE 2026-10-03 Problem vbox stuck:
Your last version seems great, really, i'm making my list of fixes, really minor. However, i tested it with a really large table, about 29000 rows and some blobs in, and ... my whole vbox VM (with 16gb,debian), got stuck and i had to restart it ... also, the postgres server indicated a stale open connection, without transaction, performing a pg_cancel_backend()

# DONE 2026-10-04B:
- In those cases where it was asked to 'hide' all browsed rows, where the UI shows the message "Siblings hidden during row edit — Cancel or Submit to show all rows again.", PLEASE hide the browser complete, don't show any messages.
- These requests were made before and were not met:
  - Can we Show HotX version in connection dialog
  . Can you show the field's data-type tooltip in the table browser headers, as you already do in the form labels?

## DONE - fk diagram  2026-10-04C:
- Please: Can you make more space for the labels of the arrows of the foreign-key relations diagram ?
- Please: Can you make sure that the labels are not truncated, and that they are readable 
  - The arrow's labels are are the most important information to display in this diagram.
- Please: that some of the squares in the diagram contain the list of fields of the table, and some others don't

# DONE 2026-10-04D:
- when i select the "use as master row" button/icon, can you please leve displayed the fields from that row , as a browser table with a single row ?