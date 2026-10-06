
## Drill-down on foreign keys
- For cases of a table browser, displaying a field refering to a foreign key, and only for the case of the least significant key of the foreign table
  - enable drill-down to a form displaying more fields of the foreign tuple, read-only. 

- For cases of a form, displaying a field refering to a foreign key, and only for the case of the least significant key of the foreign table
  - enable exploration through a table browser on the foreign table, read-only. 
  - enable value selection of the form's origin field, selectiong on the displayed table browser.

- When i enter to edit the table geo.labor_union, and provide an invalid country_id, i don't get the expected browsable (and selectable) list of available country_ids
<hr/><hr/>

# DRILL-DOWN CASES
From the 'geo.counties' table and without any other table or form:
- Assume we have entered a table bowser
- Assume the table browsed has all the keys of a foreign table
- Then select the browsed table field that corresponds to the least significant of the foreign key fields
- Previously, enable clicks on that displayed field value
- When the click happens, create a table form (above the current table browser)
  - The created form should show the detail of the row of the of the referenced table
- this mechanism should work with any other table that has foreign keys

new feature
-  if you can please remove, from the field headers of the table browser, the data-type & other info, leaving only the field name

From the 'geo.counties' table and no other table or form:
- Assume we have entered a table bowser
- Assume the table browsed has all the keys of a foreign table
- Then select the form's table field that corresponds to the least significant of the foreign key fields
- Previously, enable clicks on that displayed field value
- When the click happens, create a table browser (above the current table form)
  - The created table browser should show the detail of the rows of the of the referenced table, limited by the values of all minus the last foreign key values already set 
- this mechanism should work with any other form and any other foreign key relation
