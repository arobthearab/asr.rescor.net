//jshint esnext:true
/*exported Interaction 		*/
/*exported Interactions 	*/
/*global Change 			*/
/*global Table 				*/
//*****************************************************************************
//* Interaction
//*	Control keyboard interactions
//*****************************************************************************
class Interaction
{
	constructor ( initializer )
	{
		this.code = initializer.code;
		this.needCtrl = Interaction._boolean(initializer.needCtrl);
		this.needMeta = Interaction._boolean(initializer.needMeta);
		this.needShift = Interaction._boolean(initializer.needShift);
		this.action = initializer.action;
		this.prevent = Interaction._boolean(initializer.prevent);
		this.stop = Interaction._boolean(initializer.stop);
		this.label = initializer.label;
		this.legend = initializer.legend;
	}
	
	static _boolean ( value )
	{
		var answer = false; 
		
		if ((value === undefined) || (value === null))
		{
			answer = false;
		}
		else if (typeof value === "boolean")
		{
			answer = value;
		}
		else 
		{
			answer = value ? true : false;
		}
		
		return answer;
	}
}
//*****************************************************************************
//* Interactions
//*	Control keyboard interactions
//*****************************************************************************

class Interactions
{
	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	constructor ( keys , initializer )
	{
		this.keys = [];
		this.loadKeys(keys);
		
		this.rowClickHandler = (initializer instanceof Object) && ("rowClickHandler" in initializer) ? 
			initializer.rowClickHanlder : this.handleRowClick;
		this.rowClickContext = (initializer instanceof Object) && ("rowClickContext" in initializer) ? 
			initializer.rowClickContext : "#table tbody";
		
		if (this.rowClickHandler instanceof Function)
		{
			$(this.rowClickContext).on("click", "tr", this.rowClickHandler);
		}
		
		$("html").data("interactions", this);			
		$("html").on("keydown", this.handleKey);
	}

	//---------------------------------------------------------------------
	// Initialize key action list
	//---------------------------------------------------------------------	
	loadKeys ( initializer )
	{
		if (initializer)
		{
			if (!(initializer instanceof Array))
			{
				initializer = [ initializer ];
			}
		
			for (var descriptor of initializer)
			{
				this.keys.push(new Interaction(descriptor));
			}
		}
	}
	
	//---------------------------------------------------------------------
	// Build a legend of key actions
	//---------------------------------------------------------------------	
	actionLegend ( )
	{
		var apple = navigator.userAgent.match(/Macintosh/i);
		var prefix = apple ? "&#8984;" : "CTRL";
		var labels = [ "Select Row" ];
		var keys = [ prefix + "-click" ];
		var seen = {};
		var legend = "<table class='legend'><thead><tr>";
		
		for (var key of this.keys)
		{
			var code = key.code;
			
			if (!seen[code])
			{
				labels.push(key.label);
				keys.push(prefix + "-" + key.legend);
			}
		}
	
		legend += "<td>" + keys.join("</td><td>") + "</td></tr></tbody></table>";
	
		return legend;
	}
	
	//---------------------------------------------------------------------
	// Determine if an action has occurred
	//---------------------------------------------------------------------	
	getAction ( thrown )
	{
		var self = this ? this : $("html").data("interactions");
		
		var key = thrown.keyCode;
		var ctrlKey = thrown.ctrlKey;
		var metaKey = thrown.metaKey;
		var shiftKey = thrown.shiftKey;
		var answer = null;
		
		for (var descriptor of self.keys)
		{
			if (descriptor.code !== key) { continue; }
			if (descriptor.needCtrl && !ctrlKey) { continue; }
			if (descriptor.needMeta && !metaKey) { continue; }
			if (descriptor.needShift && !shiftKey) { continue; }
			
			console.log("Interactions/getAction match", descriptor, thrown);
			
			answer = descriptor;
			break;
		}
		
		return answer;
	}

	//---------------------------------------------------------------------
	// jQuery handler for mouse click on a row
	//---------------------------------------------------------------------	
	handleRowClick ( thrown )
	{
		// console.log("Interactions/handleRowClick", thrown);
		
		if (thrown.metaKey || thrown.ctrlKey)
		{
			$(this).removeClass("new");
			$(this).toggleClass("selected");
		}
	}

	//---------------------------------------------------------------------
	// jQuery handler for keydown 
	//---------------------------------------------------------------------	
	handleKey ( thrown )
	{
		// console.log("Interactions/handleKey", thrown);

		var self = $("html").data("interactions");
		var descriptor = self.getAction(thrown);
		
		if (descriptor)
		{
			if (descriptor.prevent) { thrown.preventDefault(); }
			if (descriptor.stop) { thrown.stopPropagation(); }
			
			descriptor.action.call(this, thrown);
		}
	}
	
	//---------------------------------------------------------------------
	// jQuery handler for UI "insert row" (clone row)
	//---------------------------------------------------------------------
	actionInsert ( /* thrown */ )
	{
		// Access DOM and UI objects
		var { table } = Table.getDomAncestry(this);
		
		// Access datatable object
		var dataTable = table.object.dataTable; 
		
		// Get list of selected rows
		var selectedRows = dataTable.rows(".selected")[0];
		var selectedRowsCount = selectedRows.length;
	
		// Necessary?
		// thrown.preventDefault();
	
		if (selectedRowsCount !== 1)
		{
			alert("You must select exactly one row as a template for the new row!");
		}
		else 
		{
			// Get information about template row
			var templateRow = selectedRows[0];
			var templateData = dataTable.row(templateRow).data();
			var templateId = templateData.digest;
			
			// Copy template properties to new row data
			var newData = {};
			
			for (var property in templateData)
			{
				newData[property] = templateData[property];
			}
			
			// Update proprties for new row
			newData.digest = "NEW" + Date.now() + "_" + templateId;
			newData.exemplar = null;
			newData.exemplarDescription = null;

			// Add the row to the database	
			var newElement = dataTable.row.add(newData).node();
			
			// Highlight the new row and deselect the template
			$(newElement).addClass("new");
			$(".selected").removeClass("selected");

			// Redraw the table	
			table.object.materialize({ "draw" : "full-hold"});
	
			var change = new Change("insert" , "row" , newData.digest , 
			{
				parent : templateRow , 
				child : newElement , 
				data : newData
			});
	
			table.object.changeLog.track(change);
		}
	}
	
	//---------------------------------------------------------------------
	// jQuery handler for UI "delete row"
	//---------------------------------------------------------------------
	actionRemove ( /* thrown  */ )
	{
		// Define variables
		var dataTable, selectedRows, selectedRowsCount, changes, rowSelector,
			rowElement, row, change, remove, id, logEntry;
		
		// Access DOM objects I need
		var { table } = Table.getDomAncestry(this);

		// Access dataTable object
		dataTable = table.object.dataTable;
		
		// Get list of selected rows
		selectedRows = dataTable.rows('.selected')[0];
		selectedRowsCount = selectedRows.length;
	
		// Ignore unless at least one row is selected
		if (selectedRowsCount > 0)
		{
			// Warn user before deleting rows	
			if (confirm("This will delete " + selectedRowsCount + " rows--continue?"))
			{
				changes = [];
	
				// Remove selected rows
				for (rowSelector of selectedRows)
				{
					// Get DOM element and associated row object
					rowElement = dataTable.row(rowSelector).node();
					row = $(rowElement).data("tableRow");
					
					// Remove from datatable with deferred deletion
					change = row.remove(rowSelector, true);
	
					// Keep track of changes	
					changes.push(change);
				}
				
				// Delete rows from table in reverse order
				for (remove of changes)
				{
					dataTable = remove.dataTable;
					id = "#" + remove.id;
					row = remove.row;
					
					console.log("DEBUG", "remove row", id, "data", remove.data);
					
					dataTable.row(id).remove();
				}
	
				// Create change log entry
				logEntry = new Change("delete" , "row" , null , { rows : changes });
	
				// Track the change
				table.object.changeLog.track(logEntry);
	
				// Remove class annotating selection
				$(".selected").toggleClass("selected");
	
				table.object.materialize({ "draw" : "full-hold" });
			}
		}
	}
}