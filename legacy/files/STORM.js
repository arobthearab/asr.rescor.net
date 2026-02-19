//jshint esnext:true
/*exported StormHAM533 				*/
/*exported StormCRVE3  				*/
/*exported StormSCEP  				*/
/*exported StormIapInterface		*/
/*exported StormPropertyDescriptor 	*/
/*exported StormIapTableAggregation */
/*exported StormIapTableColumn 		*/
/*exported StormIapTableRowTemplate */
/*exported StormIapTableRowData 	*/
/*exported StormIapTableView		*/
/*exported StormIapTable			*/
/*exported StormPairing				*/
/*exported StormPairingMap 			*/
/*exported StormIapFactor			*/
/*exported StormIapFactorSlider		*/
/*exported StormIapFactorCheckbox	*/
/*exported StormIapFactorSelector	*/
/*exported StormIapMaster			*/
/*global StackMap					*/
"use strict";

//*****************************************************************************
//* STORM utilities 
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormUtility
{
	// Get a property from an object and return default value if null or undefined
	static getDefault ( object , property , defaultValue )
	{
		var answer;
		
		if (!(property in object) || (object[property] === undefined) || (object[property] === null))
		{
			answer = defaultValue;
		}
		else
		{
			answer = object[property];
		}
		
		return answer;
	}
	
	// Set properties to default values
	static setPropertyDefaults ( object , list )
	{
		for (var property in list)
		{
			object[property] = list[property].default;
		}
		
		return object;
	}
	
	// Apply properties to an object
	static applyPropertyInitializer ( object , list , initializer )
	{
		object = StormUtility.setPropertyDefaults(object, list);
		
		if (initializer instanceof Object)
		{
			for (var property in initializer) 
			{
				if (property in list)
				{
					var descriptor = list[property];
					var value = initializer[property];
					
					object[property] = (descriptor.set instanceof Function) ?
						descriptor.set(value) :
						descriptor.set;
				}
			}
		}
		
		return object;
	}
	
	static standardColor ( name ) 
	{
		var colors =
		{
			red : "#b00" ,
			orange: "#fb0" ,
			yellow: "#bb0" ,
			blue: "#00b" ,
			green: "#0b0" ,
			"*": "#666"
		};

		var answer = (name in colors) ? colors[name] : colors["*"];
		
		return answer;
	}
	
	static upperFirst ( string , lowerRest = false )
	{
		var first = string.charAt(0).toUpperCase();
		var rest =  string.slice(1);
		
		var answer = first + (lowerRest ? rest.toLowerCase() : rest);
		
		return answer;
	}
	
	static camel ( )
	{
		var parameters = Array.prototype.slice.call(arguments);
		var name = parameters.join(" ").replace(/^\s+/, "");			
		var pieces = name.replace(/\W/g, " ").split(/\s+/);
		var answer = pieces.shift().toLowerCase();
		
		for (var piece of pieces)
		{
			answer += StormUtility.upperFirst(piece);
		}
		
		return answer;
	}
	
	static scalify ( value , scale  )
	{
		var answer = Math.round(value * scale);
		
		return answer;
	}
	
	static precisify ( value , precision , numeric )
	{	
		var answer;
		
		if ((precision === null) || isNaN(precision))
		{
			console.log("StormUtility/precisify called with non-numeric precision [" + precision + "]");
			
			answer = value;
		}
		else
		{
			if ((numeric === undefined) || (numeric === null) || (numeric === false))
			{
				answer = Number(value).toFixed(precision);
			}
			else
			{
				precision = Number(precision).toString();
				answer = Number(Math.round(value + "e+" + precision) + "e-" + precision);
			}
		}

		return answer;
	}
	
	static searchTable ( table , value , returnRow )
	{
		var row, candidate;
		var answer = null;
	
		table.rows().every(function ( index )
		{
			if (answer === null)
			{
				row = this.data();
				candidate = row[0];
				
				if (candidate === value)
				{
					answer = returnRow ? row : index;
				}
			}
		});
		
		return answer;
	}
	
	// Return either an explicit value or an implicit value from this object
	static sift ( condition = false , explicit = null , implicit = null )
	{
		var answer = condition ?
			(explicit ? explicit : null) :
			implicit;
					
		return answer;
	}
	
	// Wrap the jQuery "isEmptyObject" call 
	static empty ( object )
	{
		var answer =
			(object === null) ||
			(object === undefined) ||
			$.isEmptyObject(object);
			
		return answer;		
	}
	
	// Convert a stringified number to numeric value, leave other values alone
	static stringToNumber ( value )
	{
		var answer = (value !== null) && (value !== undefined) && !isNaN(value) && (typeof value !== "boolean") ?
			parseFloat(value) : 
			value;
			
		return answer;
	}
	
	// Initialize an object 
	static initializeObject ( value , template = {} )
	{
		var answer = value;
		
		if ((value === null) || (value === undefined) || !(value instanceof Object))
		{
			answer = Object.assign({}, template);
		}
				
		return answer;
	}
	
	// Convert a dotted class name to a class name without a dot
	static undot ( value )
	{
		var answer;
		
		if ((value !== null) && (value !== undefined))
		{
			if (value.match(/^\./))
			{
				answer = value.substr(1);
			}
			else
			{
				answer = value;
			}
		}
		
		return answer;
	}
}

//*****************************************************************************
//* STORM Object property initializer
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapProperty
{
	// Constructor
	constructor ( initializer = { name : null , required : null , description : null , class : null , default: null , set : null } )
	{
		if ((initializer.name === null) || (initializer.name === undefined))
		{
			throw new TypeError("StormIapProperty/constructor no property name");
		}
		else
		{
			this.name = initializer.name;
			this.required = initializer.required;
			this.description = initializer.description;
			this.class = initializer.class;
			this.default = initializer.default;
			this.set = initializer.set;
		}
	}
}

//*****************************************************************************
//* STORM Object property initializer
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapPropertyInitializer
{
	// Constructor
	constructor ( object = {} , list = [] , permissive = true )
	{
		this.finalProperties = object;
		this.validProperties = {};
		this.permissive = permissive;
		this.valid = undefined;
		
		this.load(list);
	}
	
	// Load properties from list
	load ( list = [] )
	{
		this.validProperties = {};
		
		for (var property of list)
		{
			if (!(property instanceof StormIapProperty))
			{
				property = new StormIapProperty(property);
			}
			
			this.validProperties[property.name] = property;
		}
		
		return this;
	}
	
	// Set the final object
	set finalProperties ( object )
	{
		if ((object !== null) && (object !== undefined) && (object instanceof Object))
		{
			this._finalProperties = object;
		}
		else if ((this.final === null) || (this.final === undefined) || (!this.final instanceof Object))
		{
			this._finalProperties = {};
		}
		
		return this._finalProperties;
	}
	
	// Get the final object
	get finalProperties ( )
	{
		return this._finalProperties;
	}
	
	// Iterate through properties
	*propertyIterator ( final = false ) //jshint ignore:line
	{
		var properties = Object.assign({}, (final ? this.finalProperties : this.validProperties));
		
		for (var property in properties)
		{
			yield properties[property]; //jshint ignore:line
		}
	}
	
	// Set defaults for final property values
	setDefaults ( object )
	{
		this.finalProperties = object;
		
		for (var property in this.validProperties)
		{
			if ("default" in this.validProperties[property])
			{
				this.finalProperties[property] = this.validProperties[property].default;
			}
		}
		
		return this;
	}
	
	// Set a value
	static set ( value , descriptor )
	{
		var answer;
		
		if (descriptor.set instanceof Function)
		{
			answer = descriptor.set.call(this, value);
		}
		else if ((descriptor.set !== null) && (descriptor.set !== undefined))
		{
			answer = descriptor.set;
		}
		else 
		{
			answer = value;
		}
		
		return answer;
	}
	
	// Apply property values
	apply ( initializer , object = null )
	{
		this.setDefaults(object);
		
		if (initializer instanceof Object)
		{
			for (var property in initializer) 
			{
				if (property in this.validProperties)
				{
					var descriptor = this.validProperties[property];
					var value = initializer[property];
					
					this.finalProperties[property] = StormIapPropertyInitializer.set(value, descriptor);
				}
			}
		}
		
		return this;
	}
}

//*****************************************************************************
//* STORM IAP pairing object
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormPairing
{
	// Constructor
	constructor ( source = { label : null , template : null , data : null } , target = { label : null , template : null , data : null } )
	{
		this.source = source;
		this.target = target;
		
		this.getPairId();
		this.getPairData();
		this.getPairJson();
		this.getMarkup();
	}
	
	// Generate a pair name
	getPairNames ( sourceRow , targetRow )
	{
		sourceRow = sourceRow ? sourceRow : this.source.data;
		targetRow = targetRow ? targetRow : this.target.data;
		
		var sourceNameRaw = this.source.template.map("name", sourceRow);
		var targetNameRaw = this.target.template.map("name", targetRow);
		
		var sourceName = sourceNameRaw.replace(/[^a-zA-Z0-9]+/g, "_");
		var targetName = targetNameRaw.replace(/[^a-zA-Z0-9]+/g, "_");
		
		var pairId = sourceName + "-" + targetName;
		
		var names =
		{
			sourceNameRaw : sourceNameRaw ,
			targetNameRaw : targetNameRaw ,
			sourceName : sourceName ,
			targetName : targetName ,
			pairId : pairId
		};
		
		return names;
	}
	
	// Generate a pair element name
	getPairId ( )
	{
		var names = this.getPairNames(); 
		
		this.names = names;
		this.id = names.pairId;
		
		return this;	
	}
	
	// Pair data
	getPairData ( )
	{	
		var data = {};
		
		data[this.source.label] = this.source.data;
		data[this.target.label] = this.target.data;
		
		this.data = data;
		
		return this;
	}
	
	// Convert the result to JSON 
	getPairJson ( )
	{
		var json = JSON.stringify(this.data);
		
		this.json = json;
		
		return this;
	}
	
	// Return the jQuery element for this pairing - CANNOT BE CHAINED
	getPairElementId ( )
	{
		return $("#" + this.id);
	}
	
	// Determine if the pair is selected
	isSelected ( )
	{
		var element = this.element();
		var answer = false;
		
		if ((element.length > 0) && element.is("input[type=checkbox]") && element.prop("checked"))
		{
			answer = true;
		}
		
		return answer;
	}
	
	// Return the markup for a pairing - CANNOT BE CHAINED
	markup ( )
	{
		var checked, markup;
		
		// If the element exists and is already checked...
		checked = this.isSelected();
		
		// Markup for the pair
		markup =
			$("<input>", { type : "checkbox" , checked : checked , id : this.id , value : this.id }).
				data("StormPairing" , this).
				data("sourceName", this.names.sourceNameRaw).
				data("targetName", this.names.targetNameRaw);

		return markup;		
	}
}

//*****************************************************************************
//* STORM IAP pairing map
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormPairingMap
{
	// Constructor
	constructor ( label = { pair : null , source : null , target : null } , container = null , traction = null )
	{
		this.container = container; // The container (div) for the pairing UI
		this.traction = traction;	// Tracking action callback (called as method of StormPairingMap)
		this.label = label;			// Label for the pairing, e.g. V-T, V-C, T-C, etc.
		this.map = {};				// Map of pairs
		this.selectedPairs = 0;		// Number of selected pairs
	}
	
	// Return a named pair
	getPair ( name )
	{
		if (name.match(/^#/))
		{
			name = name.substr(1);
		}
		
		var answer = (name in this.map) ? this.map[name] : null;
		
		return answer;
	}
	
	// Pair two 
	pair ( sourceRow , targetRow )
	{
		var pairing = new StormPairing( 
			{ label : this.label.source , object: sourceRow } , 
			{ label : this.label.target , object : targetRow } 
		);
		
		this.map[pairing.id] = { object : pairing , markup : pairing.markup(this.track) };
		
		return this;
	}
	
	// Track selected pairs - jQuery "change" event ("this" is affected element)
	track ()
	{
		// Reduce overhead for multiple jQuery calls
		var cache = $(this);
		
		var self = cache.data("StormPairingMap");
		var id = cache.prop("id");
		var pair = self.getPair(id);
		
		if (pair)
		{
			this.selectedPairs++;
	
			if (self.traction instanceof Function)
			{
				self.traction(this);
			}
		}
	}
	
	// Generate header row
	_headerMarkup ( table )
	{
		var data = table.view.dataTable.rows();
		var row = $("<tr>").append($("<td>"));
		
		data.every( function ()
		{
			var name = table.view.rowTemplate.map("name", this.data());
			
			row.append($("<td>").html(name));
		});
		
		return row;
	}
		
	// Generate markup for pairing map
	markup ( sourceTable, targetTable )
	{
		// Don't forget to add data context for map object
		// don't forget to add tracking function to markup returned from StormPairing.markup
		var markup, header;
		
		// Start the markup
		markup = this.container;
		
		// Generate a header row
		header = $("<thead>").append(this._headerMarkup(targetTable));
			
		sourceTable.view.dataTable.every( function () 
		{
			var sourceRow, sourceName;
			
			sourceRow = this.data();
			sourceName = sourceTable.view.rowTemplate.map("name", sourceRow);
			
			
		});
	}
}

//*****************************************************************************
//* STORM IAP result column
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapTableColumn
{
	// New ojbect constructor
	constructor ( name , column , attributes = { visible : null , width : null , render : null , className : null 	} )
	{
		this.name = name;
		this.column = column;
		this.attributes = attributes;
		this.value = null;
	}
	
	// Return a DataTables columnDefs object
	getColumnDefinition ()
	{
		var answer = { targets : this.column , name : this.name };
		
		for (var attribute in this.attributes)
		{
			var value = this.attributes[attribute];
			
			if (value !== undefined && value !== null)
			{
				answer[attribute] = this.attributes[attribute];
			}
		}
		
		return answer;
	}
}

//*****************************************************************************
//* STORM IAP Model Object 
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************

class StormIapModel
{
	// Constructor
	constructor ( components = {} )
	{
		// What we started with 
		this.original = components;
		
		// Set everything else
		this.reset(components);
		
		// Fix the version - null version defaults to V3
		if (this.name && ((this.version === null) || (this.version === undefined)))
		{
			console.log("StormIapModel/constructor missing intake version set version to 3 for model '" + this.name + "'");
			
			this.version = 3;
		}

		// Whether or not this is a template (R/O)
		this.template = false;
	}
	
	// Reduce a source to its valid components
	static cleanSource ( source , setDefault = false , cleanProperties = null )
	{
		var target = { valid : false };
	
		// Case where source is an array containing the source object
		if ((source instanceof Array) && (source.length > 0))
		{
			target = StormIapModel.cleanSource(source[0]);
		}
		
		// Otherwise should be the source object
		else
		{
			var properties = cleanProperties ? cleanProperties : StormIapModel.sourceProperties;
			
			for (var property in properties)
			{
				if ((property in source) || setDefault)
				{
					var value = source[property];
					
					// If set are setting defaults and source value isn't there ...
					if ((value === undefined) || (value === null) && setDefault)
					{
						target[property] = properties[property].default;
					}
					
					// Value is explicitly present in source
					else
					{
						target[property] = value;
					}
					
					target.valid = true;
				}
			}
		}
		
		return target;
	}
	
	// These are the valid properties for a model source
	static get sourceProperties ()
	{
		const properties = 
		{
			"assets" : { default : [] } ,
			"name" : { default : null } ,
			"pairings" : { default : [] } ,
			"revision" : { default : null } ,
			"riskModel" : { default : null } ,
			"risks" : { default : [] } ,
			"threats" : { default : [] } ,
			"update" : { default : null } ,
			"updatedBy" : { default : null } ,
			"version" : { default : 4 } ,
			"audit" : { default : [] } ,
			"template" : { default : false } ,
			"templateScope" : { default : null } ,
			"deleted" : { default : false } ,
			"vulnerabilities" : { default : [] } ,
			"controls" : { default : [] }
		};
		
		return properties;
	}
	
	// Current model version
	static get currentVersion ()
	{
		const version = 4;
		
		return version;
	}

	// Return an object containing only the storable properties
	descriptor ( )
	{
		var answer = {};
		
		for (var [property , options] of Object.entries(StormIapModel.sourceProperties))
		{
			if (property in this)
			{
				answer[property] = this[property];
			}
			else if ("default" in options)
			{
				answer[property] = options.default;
			}
		}
		
		return answer;
	}
	
	// Defined version conversions
	get validConversions ()
	{
		const conversions =
		{
			"3-4" : this.convertV3toV4 ,
			"4-4" : this.convertV4toV4 ,
		};
		
		return conversions;
	}
	
	// Perform a conversion if possible
	convert ( )
	{
		var from = this.version.toString();
		var to = StormIapModel.currentVersion.toString();
		
		var name = from + "-" + to;
		var conversions = this.validConversions;
	
		if (!(name in conversions) && (from < to))
		{
			throw new Error("StormIapModel/convert cannot convert from version " + from + " to version " + to);
		}
		else
		{
			var conversion = conversions[name];
		
			conversion.call(this);	
		}
		
		return this;
	}
		
	// Broken V4 to good V4 conversion
	convertV4toV4 ( )
	{	
		var fixShortThreat = function ( ) 
		{
			// Insert "template" field
			row.splice(1, 0, (this instanceof StormIapModelTemplate));
			
			return row;
		};
		
		var fixShortVulnerability = fixShortThreat;
		
		var fixShortControl = function ( )
		{
			// Insert "implemented" field with default 50%
			row.splice(4, 0, 0.5);
			
			// Divide "correction" field to get 0..1
			if (row[5] > 1)
			{
				row[5] = row[5] / 100;
			}
			
			// Calculate "effective" field;
			row[6] = row[5] * 0.5;
			
			return row;
		};
		
		var map =
	 	{ 
			"threats" : 
			{ 
				action: fixShortThreat , 
				condition: (componentName , row) => (componentName === "threats") && (row.length < 7) 
			} , 
			"vulnerabilities" : 
			{ 
				action: fixShortVulnerability , // jshint ignore:line
				condition: (componentName , row) => (componentName === "vulnerabilities") && (row.length < 7) 
			} , 
			"controls" : 
			{ 
				action: fixShortControl , 
				condition: (componentName , row) => (componentName === "controls") && (row.length < 7) 
			} , 
			"risks" : null , 
			"pairings" : null 
		};
		
		var source = Object.assign({}, this.current);
		var converted = { conversion: 0 , object: 0 };
		
		// Create a copy of bad data for gits and shiggles
		source.previous = Object.assign({}, this.current);
		
		// V4 tables MAY have objects rather than arrays as rows
		for (var [componentName, conversion] of Object.entries(map))
		{
			if ((conversion === null) || !(conversion.action instanceof Function))
			{
				continue;
			}
			
			var {action, condition} = conversion;
			var component = source[componentName];
			 
			for (var index in component)
			{
				var row = component[index];
				
				// Perform various conversions
				if (condition(componentName, row))
				{
					row = action.call(this, componentName, index, row);
					converted.conversion++;
				}

				// Fix "object" rows
				if (!(row instanceof Array) && ("row" in row))
				{
					component[index] = row.row;
					converted.object++;
				}
			}
		}
		
		if (converted.conversion || converted.object)
		{
			console.log("StormIapModel/convertV4toV4 fixed " + converted.object + 
				" object rows and " + converted.conversion + " conversion rows in " + source.name);
		}
	}

	// Version 3 to 4 conversion
	convertV3toV4 ( )
	{
		var source = Object.assign({}, this.current);
		var index;
		
		// Create a copy of V3 data for gits and shiggles
		source.previous = Object.assign({}, this.current);
		
		// Determine if this is a Model or a Template
		var isTemplate = (this instanceof StormIapModelTemplate) ? true : false;
		
		// Threats in V4 have an "isTemplate" column in position 1
		for (index in source.threats)
		{
			source.threats[index].splice(1, 0, isTemplate);
		}
		
		// Vulnerabilities in V4 have an "isTemplate" column in position 1
		for (index in source.vulnerabilities)
		{
			source.vulnerabilities[index].splice(1, 0 , isTemplate);
		}

		// Asset HV data usage in V4 must be expanded in a non-deterministic way
		if ("assets" in source)
		{
			for (index in source.assets)
			{
				var asset = source.assets[index];
				
				// Convert HV data value to new scale
				var highValue = asset[2];
				asset[2] = highValue / 5 * 10.2001953125;
				
				var status = 
				{
					highValueData_business: null ,
					highValueData_finance: null ,
					highValueData_hr: null ,
					highValueData_it: null ,
					highValueData_legal: null ,
					highValueData_none: null	
				};
				
				switch (highValue)
				{
					case 1:
						status.highValueData_none = 1;
						break;
					case 2:
						status.highValueData_it = 4;
						status.highValueData_business = 3;
						break;
					case 3:
						status.highValueData_hr = 8;
						break;
					case 4:
						status.highValueData_hr = 8;
						status.highValueData_legal = 6;
						status.highValueData_finance = 7;
						break;
					case 5:
						status.highValueData_hr = 8;
						status.highValueData_legal = 6;
						status.highValueData_finance = 7;
						status.highValueData_business = 3;
						status.highValueData_it = 1;
						break;
					default:
				}
				
				// Set a field to contain the status
				asset[3] = status;
				
				// Replace the asset
				source.assets[index] = asset;
			}
		}
				
		// Set the version number
		source.version = 4;
		
		this.reset(source);
		
		return this;
	}
	
	// Combine a new source with the existing source
	combine ( components )
	{	
		components = StormIapModel.cleanSource(components);
		
		if (components.valid)
		{
			var combined = Object.assign(this.current , components);
			
			this.reset(combined);
		}
		
		return this;
	}
	
	// Reset this object
	reset ( components )
	{
		var working, property, value;
		
		this.current = {};
		
		// Set all specific properties to null
		for (var [key, descriptor] of Object.entries(StormIapModel.sourceProperties)) 
		{
			this[key] = descriptor.default;
			this.current[property] = descriptor.default;
		}

		// If there is something to reset to...
		if ((components !== null) || (components !== undefined))
		{
			working = StormIapModel.cleanSource(components);
			
			if (!working.valid)
			{
				console.log("StormIapModel/reset components invalid", components);
			}
			else
			{
				for (property in working)
				{
					if (property !== "valid")
					{
						value = this.stringsToNumbers(working[property]);
						
						this[property] = value;
						this.current[property] = value;
					}
				}
			}
		}
		
		return this;
	}
	
	// Convert a stringified number to an actual number
	stringToNumber ( value )
	{
		var answer = (value !== null) && (value !== undefined) && !isNaN(value) && (typeof value !== "boolean") ?
			parseFloat(value) : 
			value;
			
		return answer;
	}
	
	// Convert any stringified numbers to actual numbers
	stringsToNumbers ( data )
	{
		var answer, parsed , element;
		
		// Passed nothing - NOTE: (data !== data) tests for an explicit value of NaN
		if ((data === null) || (data === undefined) || (data !== data))
		{
			answer = null;
		}
		
		// Passed a scalar 
		else if (!(data instanceof Object))
		{
			try
			{
				parsed = JSON.parse(data);
			}
			catch (error)
			{
				parsed = data;
			}
			
			answer = this.stringToNumber(parsed);
		}
		
		// Passed an array
		else if (data instanceof Array)
		{
			answer = [];
			
			for (element of data)
			{
				answer.push(this.stringsToNumbers(element));
			}
		}
		
		// Passed an object
		else 
		{
			answer = {};
			
			for (var [key, value] of Object.entries(data))
			{
				answer[key] = this.stringsToNumbers(value);
			}
		}
		
		return answer;
	}
	
	// Spread a model across an interface
	spread ( interfaces = { assets : null , threats : null , vulnerabilities : null , controls : null } )
	{
		for (var component in interfaces)
		{
			var face = interfaces[component];
			
			if (component in this)
			{
				if (face.spread instanceof Function)
				{
					face.spread(this[component]);
					face.update();
				}
				else
				{
					throw new ReferenceError("StormIapModel/spread interface component " + component + " doesn't have a spread method");
				}
			}
		}
		
		return this;
	}
	
	// Scrape an interface to build a model
	scrape ( interfaces = { assets : null , threats : null , vulnerabilities : null , controls : null } )
	{
		for (var [component, face] of Object.entries(interfaces))
		{
			if (face && (face.scrape instanceof Function))
			{
				this[component] = face.scrape();
			}
			else if (face)
			{
				throw new ReferenceError("StormIapModel/scrape interface component " + component + " doesn't have a scrape method");
			}
		}
		
		return this;
	}
}

//*****************************************************************************
//* STORM IAP model template
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapModelTemplate extends StormIapModel
{
	// Constructor
	constructor ( components )
	{
		components = StormIapModelTemplate.cleanSource(components);
		
		super(components);
		
		this.template = true;
	}
	
	// Clean properties so that only valid properties remain
	static cleanSource ( source , setDefault = false )
	{
		var working = super.cleanSource(source, setDefault, StormIapModelTemplate.validProperties);
		
		return working;
	}
	
	// Valid properties for this template
	static get validProperties ()
	{
		var additionalProperties =
		{
			"template" : { default : false } ,
			"templateScope" : { default : null } ,			
		};
		
		var properties = Object.assign({}, StormIapModel.sourceProperties, additionalProperties);
		
		return properties;	
	}
}

//*****************************************************************************
//* STORM IAP model map
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapModelMap
{
	// Constructor 
	constructor ( initializer = { actor : null , identityCheck : null , callback : null } )
	{
		this.identityCheck = null;
		this.callback = null;
		
		this.reset(initializer);
	
		this.setState();			
		this.setContext();
	}
	
	// State static methods
	static get STATE_LOADING () { return 1; }
	static get STATE_UPDATING () { return 2; }
	static get STATE_IDLE () { return 0; }
	
	// Action static methods
	static get ACTION_NONE () { return null; }
	static get ACTION_GET () { return "get"; }
	static get ACTION_SAVE () { return "save"; }
	static get ACTION_AUTOSAVE () { return "autosave"; }
	static get ACTION_HIDE () { return "hide"; }
	
	// Reset the object
	reset ( initializer )
	{ 
		this.models = {};
		this.templates = {};
	
		if ("actor" in initializer) { this.actor = initializer.actor; }	
		if ("identityCheck" in initializer) { this.identityCheck = initializer.identityCheck; }	
		if ("callback" in initializer) { this.callback = initializer.callback; }	
		
		return this;
	}
	
	// Set state
	setState ( state = StormIapModelMap.STATE_IDLE , action = StormIapModelMap.ACTION_NONE )
	{
		var previous = this.getState();
		
		switch (state)
		{
			case StormIapModelMap.STATE_LOADING:
			case StormIapModelMap.STATE_UPDATING:
			case StormIapModelMap.STATE_IDLE:
			{
				this.state = state;
				break;
			}
			default: 
			{
				throw new Error("StormIapModelMap/setState invalid state '" + state + "'");
			}
		}
		
		switch (action)
		{
			case StormIapModelMap.ACTION_NONE:
			case StormIapModelMap.ACTION_GET:
			case StormIapModelMap.ACTION_SAVE:
			case StormIapModelMap.ACTION_AUTOSAVE:
			case StormIapModelMap.ACTION_HIDE:
			{
				this.action = action;
				break;
			}
			default: 
			{
				throw new Error("StormIapModelMap/setState invalid action '" + action + "'");
			}
		}
		
		return { previous: previous , current: this.getState() };
	}
	
	// Get state
	getState ( )
	{
		return { state : this.state , action : this.action };
	}
	
	// Set context
	setContext ()
	{
		$("html").data("StormIapModelMap", this);
	}
	
	// Get context
	static getContext ()
	{
		var map = $("html").data("StormIapModelMap");
		
		return map;
	}
	
	// Load the map from AJAX
	ajax ( { updates = null , autosave = false , postProcessor = null } = {} ) // jshint ignore:line
	{		
		// If the action is a function, move forward
		if (!(this.actor instanceof Function))
		{
			throw new Error("StormIapModelMap/load no AJAX actor function defined");
		}
		else
		{			
			// If there is no identity check, provide one that always fails
			if (!(this.identityCheck instanceof Function))
			{
				this.identityCheck = function () { return false; };
			}
			
			// Call the AJAX actor
			// - Receives context of the StormIapModelMap as "this"
			// - Internal AJAX success callback provided
			// - Internal AJAX failure callback provided
			// - Any updates to be applied
			// - Autosave flag (true or false)
			var callback = this.actor.call(this, this._ajaxSuccess, this._ajaxFailure, updates, autosave);
			
			// If the action returns a callback, save it
			if (callback instanceof Function)
			{
				this.callback = callback;
			}
			
			// If we were supplied a post-processor, invoke it
			if (postProcessor instanceof Function)
			{
				postProcessor.call(this, updates, autosave);
			}
		}
		
		return this;
	}
	
	// Load objects using AJAX
	load ( { postProcessor = null } = {} ) // jshint ignore:line
	{
		this.setState(StormIapModelMap.STATE_LOADING, StormIapModelMap.ACTION_GET);
		
		var answer = this.ajax({ postProcessor : postProcessor });
		
		return answer;
	}
	
	// Delete objects using AJAX
	hide ( { updates = null , postProcessor = null } = {} ) // jshint ignore:line
	{
		this.setState(StormIapModelMap.STATE_UPDATING, StormIapModelMap.ACTION_HIDE);
		
		if (updates instanceof StormIapModel)
		{
			updates = updates.descriptor();
		}
		
		var answer = this.ajax({ updates: Object.assign(updates, { delete: true }) , autosave: true , postProcessor: postProcessor });
		
		return answer;
	}
	
	// Update objects using AJAX 
	save ( { updates = null , postProcessor = null } = {} ) // jshint ignore:line
	{
		this.setState(StormIapModelMap.STATE_UPDATING, StormIapModelMap.ACTION_SAVE);
		
		if (updates instanceof StormIapModel)
		{
			updates = updates.descriptor();
		}
		
		var answer = this.ajax({ updates : updates , postProcessor : postProcessor });
		
		return answer;
	}
	
	// Autosave object using AJAX
	autosave ( { updates = null , postProcessor = null  } = {} ) //jshint ignore:line
	{
		this.setState(StormIapModelMap.STATE_UPDATING, StormIapModelMap.ACTION_AUTOSAVE);
		
		if (updates instanceof StormIapModel)
		{
			updates = updates.descriptor();
		}
		
		var answer = this.ajax({ updates : updates , autosave: true , postProcessor : postProcessor });
		
		return answer;
	}
		
	// Remove a model
	removeModel ( name )
	{
		try
		{
			delete this.models[name];
		}
		catch (thrown)
		{
			console.log("StormIapModelMap/removeModel", thrown);
		}
	}
	
	// Remove a template
	removeTemplate ( type , name )
	{
		try
		{
			delete this.templates[type][name];
		}
		catch (thrown)
		{
			console.log("StormIapModelMap/removeTemplate", thrown);
		}

	}
	
	// Add a model 
	addModel ( name , data )
	{
		var object = (data instanceof StormIapModel) ? data : new StormIapModel(data);
		var converted = object.convert();
		
		this.models[name] = converted;
		
		return this;
	}
	
	// Add a template
	addTemplate ( type , name , data )
	{
		this.templates[type] = StormUtility.initializeObject(this.templates[type]);
		
		var object = (data instanceof StormIapModelTemplate) ? data : new StormIapModelTemplate(data);
		var converted = object.convert();
		
		this.templates[type][name] = converted;
		
		return this;
	}
		
	// Model exists
	exists ( name = null ) { return this.modelExists(name); }
	modelExists ( name = null )
	{
		var answer = (name in this.models);
		
		return answer;
	}
	
	// Template exists
	templateExists ( type = null , name = null )
	{
		var answer = false;
		
		if (type in this.templates)
		{
			if (name in this.templates[type])
			{
				answer = true;
			}
		}
		
		return answer;
	}
	
	// Get a model
	getModel ( name = null ) { return this.getModels(name); }
	getModels ( name = null )
	{
		var answer = null;
		
		try 
		{
			if (name !== null)
			{
				answer = this.models[name];
			}
			else
			{
				answer = this.models;
			}
		}
		catch (error)
		{
			if (error instanceof ReferenceError)
			{
				answer = new StormIapModel({ name : name });
			}
			else
			{
				throw error;
			}
		}
		
		return answer;
	}
	
	// Get a template
	getTemplate ( type = null , name = null ) { return this.getTemplates(type, name); }
	getTemplates ( type = null , name = null )
	{
		var answer = null;
		
		try
		{
			if (type === null)
			{
				answer = this.templates;
			}
			else if (name === null)
			{
				answer = this.templates[type];
			}
			else
			{
				answer = this.templates[type][name];
			}
		}
		catch (error)
		{
			if (error instanceof ReferenceError)
			{
				answer = null;
			}
			else
			{
				throw error;
			}
		}
		
		return answer;
	}
	
	// Get list of template types
	getTemplateTypes ( )
	{
		var answer = this.templates ? Object.getOwnPropertyNames(this.templates).sort() : [];
		
		return answer;
	}
	
	// Associate an autocomplete list with an input field  
	autocomplete ( input = null , select = null , type = null )
	{
		var source = type ? this.templates[type] : this.models;
		var list = source ? Object.getOwnPropertyNames(source).sort() : [];
		var options = { source : list };
		
		if (select instanceof Function)
		{
			options.select = select;
		}
			
		if (input !== null)
		{
			$(input).autocomplete(options);
		}
		
		return list;
	}
	
	// Perform a selection action for an autocomplete field - "this" set as jQuery action
	autoselect ( thrown , ui )
	{
		var self = StormIapModelMap.getContext();
		var type = $(this).closest("table.tabRow").find(".fubar").attr("id");
		var name = ui.item.label;
		var row = self.getTemplates(type, name);
		
		console.log("StormIapModelMap/autoselect", this, self, type, name, row);
	}
	
	// Notify the user and write a log message
	_alertLog ( caller , message , details )
	{
		var display = this.constructor.name + "/" + caller + " " + message;
		
		alert(display);
		console.log(display, details);
	}
	
	// Success loading - jQuery AJAX action 
	_ajaxSuccess ( results ) 
	{
		var self = StormIapModelMap.getContext();
			
		// If the user is not authorized, reset everything	
		if (!self.identityCheck.call(self, results))
		{
			self._alertLog("_ajaxSuccess", "authorization failure", results);
			
			self.reset();
		}
		else
		{
			// If data is returned, load it
			if (("nodes" in results) && (results.nodes !== null) && ("model" in results.nodes))
			{
				// Load models
				for (var [modelName , modelData] of Object.entries(results.nodes.model))
				{
					self.addModel(modelName, modelData);
				}
			
				// Load templates
				for (var [templateType , templateList] of Object.entries(results.nodes.template))
				{
					for (var [templateName , templateData] of Object.entries(templateList))
					{
						self.addTemplate(templateType, templateName, templateData);
					}
				}
			}
			
			// If data is NOT returned and this is a load (get) request, complain
			else if (self.action === StormIapModelMap.ACTION_GET)
			{
				self._alertLog("_ajaxSuccess", "no data returned from GET request", results);
			}
		}
		
		// Call a completion action
		if (self.callback instanceof Function)
		{
			self.callback.call(self, results);	
		}
		
		// Indicate an idle state
		self.setState();
	}
	
	// Failure loading - jQuery AJAX action
	_ajaxFailure ( request , status , exception )
	{
		var self = StormIapModelMap.getContext();
		
		self._alertLog("_ajaxFailure", "AJAX error (see JavaScript console for details)", 
			{ request : request , status : status , exception : exception });
				
		// Indicate an idle state
		self.setState();
	}
}

//*****************************************************************************
//* STORM IAP result row
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapTableRowTemplate 
{
	// New object constructor
	constructor ( columns = [] )
	{
		this.columns = columns;
		this._list = [];
		this._map = {};
		this.version = 4;
		
		this.load(columns);
	}
	
	// Ingest the StormIapTableColumn objects
	load ( columns )
	{	
		for (var column of columns)
		{
			if (!(column instanceof StormIapTableColumn))
			{
				throw new TypeError("StormIapTableRowTemplate/load column is not StormIapTableColumn");
			}
			else
			{
				var columnNumber = column.column;
				var columnName = column.name;
				
				this._list[columnNumber] = column;
				this._map[columnName] = column;
			}
		}
		
		return this;
	}
	
	// Return the length of the template
	get length ()
	{
		return this._list.length;
	}
	
	// Get a column name for a number, and vice versa
	map ( selector )
	{
		var answer = (!isNaN(selector)) ? 
			this._list[parseInt(selector)].name :
			this._map[selector].column;
			
		return answer;	
	}
	
	// Using the template, extract a column from an Array or Object containing row values
	get ( candidate , row )
	{
		var answer = null;
		var selector = isNaN(candidate) ? candidate : parseInt(candidate);
		var isNumeric = Number.isInteger(selector);
		var isArray = (row instanceof Array);
		
		// Simple index of array or object
		if ((isNumeric && isArray) || (!isNumeric && !isArray))
		{
			answer = row[selector];
		}
		// Map column number to name to index object, or name to number to index array
		else 
		{
			answer = row[this.map(selector)];
		}
		
		return answer;
	}
	
	// Return a list of DataTable columnDefs
	getColumnDefinitions ( )
	{
		var answer = [];
		
		for (var column of this._list)
		{
			answer.push(column.getColumnDefinition());	
		}
		
		return answer;
	}
	
	// Factory for StormIapTableRowData
	ingest ( row )
	{
		var answer = new StormIapTableRowData(this, row);
		
		return answer;	
	}
}

//*****************************************************************************
//* STORM IAP result row data container
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapTableRowData
{
	// Constructor
	constructor ( template = null , row = [] )
	{
		this.template = template;
		this.row = [];
		this.descriptor = {};
		
		if ((row.length > 0) || (Object.keys(row).length > 0))
		{
			this.ingest(row);
		}
	}
	
	// Set all row data values
	ingest ( row = [] )
	{	
		var columnName, columnNumber, column, length;
		
		if ((row instanceof Array) && (row.length === this.template.length))
		{
			this.row = row;
			this.descriptor = {};
			
			for (columnNumber = 0, length = this.template.length; columnNumber < length; columnNumber++)
			{
				column = this.template._list[columnNumber];
				
				this.descriptor[column.name] = row[columnNumber];
			}
		}
		else if (row instanceof Object)
		{
			this.descriptor = row;
			this.row = [];
			
			for (columnName in this.template.map)
			{
				column = this.template._map[columnName];
				
				this.row[column.column] = columnName in row ? row[columnName] : null;	
			}
		}
		else
		{
			var subError = (row instanceof Array) ?
				"(array representation with less than " + this.template.length + " columns)" :
				"(non-object, non-array representation)";
				
			throw new TypeError("StormIapTableRowData/set invalid row " + subError + " object " + row.toSource());
		}
		
		return this;
	}
	
	// Get a single data value
	set ( selector , value )
	{
		if (selector.test(/^\d+$/))
		{
			this.row[parseInt(selector)] = value;
		}
		else
		{
			this.descriptor[selector] = value;
		}
		
		return this;
	}
	
	// Return a row as an Array or Object 
	extract ( model = [] )
	{
		var answer = (model instanceof Array) ? this.row : this.descriptor;
		
		return answer;
	}
	
	// Get a value by name or column number
	get ( selector )
	{
		var answer;
		
		if (/^\d+$/.test(selector))
		{			
			answer = (selector < this.row.length) ? this.row[parseInt(selector)] : null;
		}
		else
		{
			answer = (selector in this.descriptor) ? this.descriptor[selector] : null;
		}
		
		return answer;
	}
}

//*****************************************************************************
//* STORM IAP result table aggregation descriptor
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapTableAggregation
{
	// Constructor
	constructor ( on = [] , legend = "AGGREGATE" , options = { legendColumn: null } )
	{
		this.internalOptions = { legendColumn : true };
		this.on = on.sort(function (one, two) { return one - two; });
		this.legend = legend;
		this.options = options;
	}
	
	// Return TRUE if this is a valid aggregator
	isAggregating ()
	{
		return (this.on.length > 0);
	}
	
	// Return DataTable "footerCallback" options 
	getOptions ( )
	{
		var answer = {};
		
		if (this.isAggregating())
		{
			answer.footerCallback = StormIapTableView.prototype.aggregator;
		}
		
		for (var option in this.options)
		{
			if (!(option in this.internalOptions))
			{
				answer[option] = this.options[option];
			}
		}
		
		return answer;
	}
	
	// Column number for legend
	getLegendColumn ( )
	{
		var answer = null;
		var legendColumn = this.options.legendColumn;
		
		if (this.legend)
		{
			if ((legendColumn !== null) && (!isNaN(legendColumn)))
			{
				answer = legendColumn;
			}
			else
			{
				answer = this.on[0] - 1;	
			}
		}
		
		return answer;
	}
}

/**
* A presentation view of a STORM results table
* @class
* @param {Object} view - A description of the view characteristics
* @param {string} view.element - the DOM element ID of the target for the view, or the jQuery object for same
* @param {jQuery} view.htmlTemplate - the HTML template of the view, to be copied to the target element (if null, no copy is performed)
* @param {StormIapTableRowTemplate} view.rowTemplate - describes the characteristics of every data row in the view
* @param {StormIapTableAggregation} view.aggregate - provide a means to aggregate data in the table
* @property {String} this.element - ID of DOM element containing the table
* @property {jQuery} this.cache - jQuery object associated with this.element
* @property {String} this.name - the name of this view (by default, based on ID property of this.cache
* @property {jQuery} this.htmlTemplate - HTML to be copied into this.element when view is reset
* @property {StormIapTableRowTemplate} this.rowTemplate - template for every row of data in this table
* @property {StormIapTableAggregation} this.aggregate - rules for aggregating data in the table
* @property {Object} this.dataTableOptions - options to initialize the DataTable
* @property {DataTable} this.dataTable - the DataTable object containing the data
*/
class StormIapTableView
{
	constructor ( view = { element : null , htmlTemplate : null , rowTemplate : null , aggregate : new StormIapTableAggregation() , name : null } )
	{
		this.element = (typeof view.element === "string") ? view.element : ("#" + $(view.element).prop("id"));
		this.cache = $(view.element);
		this.name = view.name ? view.name : this.cache.prop("id");
		this.htmlTemplate = view.htmlTemplate;
		this.rowTemplate = view.rowTemplate;
		this.aggregate = view.aggregate;
		this.dataTableOptions = null;
		this.dataTable = null;
		
		// Initialize the table	
		this.resetTable();
	}
	
	// Set context 
	setContext ()
	{
		this.cache.data("StormIapTableView", this);
	}
	
	// Get context
	static getContext ( dataTable )
	{
		var self = $(dataTable.table().container()).find("table").data("StormIapTableView");
		
		return self;
	}
	
	// Set all the tableoptions
	setOptions ( otherOptions = {} )
	{
		// Set DataTables "columnDefs"
		var columnDefinitions = this.rowTemplate.getColumnDefinitions();
		var columnOptions = { columnDefs : columnDefinitions };
		
		// Set DataTables "footerCallback"
		var aggregateOptions = this.aggregate.getOptions();	
		
		// Set the full DataTables configuration	
		var dataTableOptions = Object.assign( {} , aggregateOptions , columnOptions , otherOptions );
		
		// Save options
		this.dataTableOptions = dataTableOptions;
		
		return this;
	}
	
	// Helper method for materialize (materialize if we are not already materialized)
	_materializeConditionally ()
	{
		return !this.materialized;
	}
	
	// Reset the state of the DOM container
	resetTable ( )
	{
		this.materialized = false;
		
		// Reset contents of container
		if (this.htmlTemplate)
		{	
			this.cache.html(this.htmlTemplate.html());
			this.cache = $(this.element);
		}
	
		// Kludge in case this object wasn't property initialized
		if (!this.dataTable)
		{
			if ($.fn.DataTable.isDataTable(this.element))
			{
				console.log("StormIapTableView/resetTable WARNING grabbed DataTable API from element!");
				
				this.dataTable = this.cache.DataTable();
			}
		}
	
		// If the DataTable is initialized, destroy it	
		if (this.dataTable)
		{
			this.dataTable.destroy()	;
		}
		
		// Reset context
		this.setContext();
		
		// Reset options
		this.setOptions();
	}
	
	// Materialize the DataTable
	materialize ( conditional = true )
	{
		// Figure out whether we SHOULD materialize
		var should = 
			((typeof conditional === "boolean") && conditional) ||
			((conditional instanceof Function) && conditional.call(this));
			
		// And act accordingly
		if (should)
		{
			this.resetTable();
		
			this.dataTable = this.cache.DataTable(this.dataTableOptions);
			this.materialized = true;
		}
		
		return this;
	}
	
	// DataTables callback, "this" is a DataTable
	aggregator ( )
	{
		var dataTable, self, aggregate, aggregateOn, calculators, column, row, result, legendText, legendColumn;
		
		dataTable = this.api();
		self = StormIapTableView.getContext(dataTable);
		aggregate = self.aggregate;
		
		// Requires a valid aggregation object 
		if (!(aggregate instanceof StormIapTableAggregation))
		{
			throw new TypeError("StormIapTableView/aggregator called without StormIapTableAggregation object");
		}
		
		// Log message only if we aren't actually performing an aggregation
		else if (!aggregate.isAggregating())
		{
			console.log("StormIapTableView/aggregator called with inactive aggregation descriptor");
		}
		
		// Continue with aggregation
		else
		{	
			// Get values from context
			aggregateOn = self.aggregate.on;
			legendText = self.aggregate.legend;
			legendColumn = self.aggregate.getLegendColumn();
			
			// Create calculators for every aggregation column
			calculators = [];

			for (column of aggregateOn)
			{
				calculators[column] = new StormCalculator({ selector : column });
			}
			
			// Add each table row to the calculator
			dataTable.rows().every( function () 
			{
				row = this.data();
				
				for (column of aggregateOn)
				{
					calculators[column].add(row);
				}
			});
			
			// Set legend
			$(dataTable.column(legendColumn).footer()).html(legendText).addClass("black");
			
			// Now generate aggregate values
			for (column of aggregateOn)
			{
				result = calculators[column].aggregate().setPrecision(4).precisify();
				
				$(dataTable.column(column).footer()).html(result).addClass("black");
			}
		}
	}
	
	// Get the aggregate values for this table
	getAggregates ()
	{
		var answer = null;
		var column;
		
		if (this.aggregate instanceof StormIapTableAggregation)
		{
			answer = {};
			
			for (column of this.aggregate.on)
			{
				var name = this.rowTemplate.map(column);
				
				answer[name] = parseFloat($(this.dataTable.column(column).footer()).text());
			}			
		}
		
		return answer;
	}	
	
	// Invoke a callback if one is defined
	invoke ( callback , defaultResult )
	{
		var answer, parameters;
		
		if (callback instanceof Function)
		{
			parameters = Array.prototype.slice.call(arguments, 2);	
			answer = callback.apply(this, parameters);
		}
		else if (defaultResult !== undefined)
		{
			answer = defaultResult;
		}
		
		return answer;
	}
	
	// Draw the datatable
	draw ()
	{
		this.dataTable.draw();
		
		return this;
	}
	
	// Load rows from model into DataTable
	spread ( rows = [] )
	{
		return this.materialize(this._materializeConditionally).load(rows, { postLoad : this.draw });
	}

	// Load the DataTable - must be chained AFTER materialize(): this.materialize().load(rows)
	load ( rows = [] , callbacks = { preRow : null , postRow: null , preLoad: null , postLoad: null } )
	{
		var pointer, count, row, data;
		
		rows = this.invoke(callbacks.preLoad, rows, rows); 
		
		for (pointer = 0 , count = rows.length; pointer < count; pointer++)
		{
			row = rows[pointer];
			
			if (!(row instanceof StormIapTableRowData))
			{
				row = new StormIapTableRowData(this.rowTemplate, row);
			}
			
			data = this.invoke(callbacks.preRow, row.extract([]), data);
			
			this.dataTable.row.add(data);
			
			data = this.invoke(callbacks.postRow, data, data);
		}
		
		rows = this.invoke(callbacks.postLoad, rows, rows);
		
		return this;
	}
	
	// Return rows from table 
	scrape () { return StormIapTableView.prototype.getRowData.apply(this, [true, ...arguments]); }
	getRowData ( raw = false )
	{
		var answer = [];
		var self = this;
		
		if (self.dataTable && self.rowTemplate)
		{
			self.dataTable.rows().every(function ()
			{
				if (raw)
				{
					answer.push(this.data());
				}
				else
				{
					answer.push(new StormIapTableRowData(self.rowTemplate , this.data()));
				}
			});
		}
		
		return answer;
	}
}

/**
* A presentation view of a STORM results table
* @class
* @param {Array of StormIapTableView} views - A list of views 
* @param {string} defaultView - the view name to be opened by default (must exist in views)
* @property {Array of StormIapTableView} this.views - A list of views 
* @property {Object} this.map - A map of views keyed by view name, and returning a StormIapTableView
* @property {String} this.defaultView - the view that is displayed if not viewName is supplied
* @property {String} this.currentView - the view that should be currently displayed
*/
class StormIapTable 
{
	// Constructor
	constructor ( views = [] , defaultView = null , context = [] )
	{	
		this.views = views instanceof Array ? views : [ views ];
		this.map = {};
		this.defaultView = defaultView;
				
		// Verify all views are valid, and set defaultView if not provided
		for (var view of this.views)
		{
			if (!(view instanceof StormIapTableView))
			{
				throw new Error("StormIapTable/constructor view object is not StormIapTable");
			}
			else
			{
				var viewName = view.name;
				
				if ((this.defaultView === null) || (this.defaultView === undefined))
				{
					this.defaultView = viewName;
				}
				 
				this.map[viewName] = view;
			}
		}

		// defaultView must be null, or must be one of the views
		if (this.defaultView && (!(this.defaultView in this.map)))
		{
			throw new ReferenceError("StormIapTable/constructor defaultView '" + this.defaultView + "' must be null or one of the views provided");
		}

		// Set the current view to the default view
		this.currentView = this.defaultView;
		
		// Set context
		this.context = (context instanceof Array ? context : [ context ]).map(element => $(element));
		this.setContext(context);
	}
	
	// Map contexts to jQuery objects if they are strings
	static _mapContexts ( context )
	{
		context = (context instanceof Array ? context : [ context ]).map(
			element => 
			{
				var answer;
				var choice;
				
				if (typeof element === "string")
				{
					answer = $(element);
					choice = "selector";
				}
				else if (element instanceof HTMLElement)
				{
					answer = $(element);
					choice = "element";
				}
				else if (element instanceof Object)
				{
					answer = element;
					choice = element.constructor.name;
				}
				else
				{
					throw new ReferenceError("StormIapTable/_mapContexts unknown element type '" + element + "'");
				}
				
				return answer; 
			}
		);
		
		return context;
	}
	
	// Set context 
	setContext ( context = [] )
	{
		context = StormIapTable._mapContexts(context);
		
		for (var cache of [...context, ...this.context])
		{
			cache.data("StormIapTable", this);
		}
	}
	
	// Get context
	static getContext ( candidates = [] )
	{
		var contexts = StormIapTable._mapContexts(candidates);
		var answer;
		
		for (var context of contexts)
		{
			if (context instanceof StormIapTable)
			{
				answer = context;
				break;
			}
			else
			{
				var candidate = context.data("StormIapTable");
			
				if (candidate)
				{
					answer = candidate;
					break;
				}
			}
		}
		
		return answer;
	}
	
	// Get the current view
	getViewName ( )
	{
		return this.currentView;
	}
	
	// Get the current view table object
	getViewObject ( viewName )
	{
		var selector = viewName ? viewName : (this.currentView ? this.currentView : this.defaultView);
		var view = this.map[selector];
		
		return view;
	}
	
	// Getter for view object for current view
	get view ( )
	{
		var answer;
		var current = this.currentView;
		var fallback = this.defaultView;
		var map = this.map;
		
		if ((typeof current === "string") && (current in map))
		{
			answer = map[current];
		}
		else if ((typeof fallback === "string") && (fallback in map))
		{
			answer = map[fallback];
		}
		else 
		{
			throw new ReferenceError("StormIapTable/view neither current nor default views are set or valid");
		}
		
		return answer;
	}
	
	// Directly access certain view methods
	get dataTable ( ) { return this.view.dataTable; }
	scrape ( ) { return this.view.scrape.apply(this, arguments); }
	spread ( ) { return this.view.spread.apply(this, arguments); }
	
	// Switch from one view of a table to another
	switchView (  viewName )
	{
		if (!(viewName in this.map))
		{
			viewName = this.defaultView;
		}
		else
		{
			this.materialize(viewName);
		}
	}
	
	// Materialize the current view
	materialize ( candidate = null )
	{
		var viewName = candidate ? candidate : this.currentView;	
		var view = this.map[viewName];
		
		view.materialize();
		
		this.currentView = viewName;
	}
}

//*****************************************************************************
//* STORM interface between process, model, and table
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapInterface
{
	// Object constructor
	constructor ( initializer )
	{
		var property;
		var properties = 
		{ 
			type : { description : "Threat, asset, vulnerability, etc." } ,
			nameElement : { objectType: String , description : "Element containing entry name" } , 
			tableObject : { objectType: StormIapTable , description : "Data table (StormIapTable)" } , 
			processObject : { objectType: StormIapProcess , description : "Data entry component (StormIapProcess)" } , 
			readyElement : { objectType: jQuery , description : "Trigger change to indicate content available" } ,
			rowGenerator : { objectType: Function , description : "Function to map CRUD to DataTable row" } ,
			postProcessor : { objectType: Function , description : "Things to do after the StormIapInterface" }
		};
		
		for (property in initializer)
		{
			if (!(property in properties))
			{
				console.log("StormIapInterface/constructor property \"" + property + "\" is unknown");
			}
			else
			{
				this[property] = initializer[property];
			}
		}

		for (property in properties)
		{
			if ((this[property] === null) || (this[property] === undefined))
			{
				console.log("StormIapInterface/constructor property \"" + property + "\" not initialized");
			}
		}
		
		this.setContext();
	}
	
	// Keep track of this object for later access from an unknown context
	setContext ( )
	{
		var tableObject = this.tableObject;
		
		if ((tableObject !== null) && (tableObject !== undefined))
		{
			$(tableObject.view.dataTable.table().container()).find("table").data("StormIapInterface", this);
		}
	}
	
	// Get the saved context
	static getContext ( candidate )
	{
		var self, cache;
		
		if ($.fn.DataTable.isDataTable(candidate))
		{
			self = $(candidate.table().container()).find("table.fubar").data("StormIapInterface");
		}
		else if ((candidate instanceof jQuery) && candidate.is("table.fubar"))
		{
			self = candidate.data("StormIapInterface");
		}
		else 
		{
			cache = $(candidate);
			self = cache.data("StormIapInterface");
			
			if (!self)
			{
				self = cache.closest("table.fubar").data("StormIapInterface");
				
				if (!self)
				{
					throw new ReferenceError("StormIapInterface/getContext no context for " + candidate);
				}
			}
		}
		
		return self;
	}
	
	// Find a value in a DataTable
	lookup ( value , returnRow = false )
	{
		var answer;
		
		if (this.tableObject instanceof StormIapTable) 
		{
			answer = StormUtility.searchTable(this.tableObject.view.dataTable, value, returnRow);
		}
		else
		{
			throw new ReferenceError("StormIapInterface/lookup called on interface without this.tableObject");
		}
		
		return answer;	
	}
	
	// Update row in table
	_updateRow ( rowNumber = null , row = null )
	{
		this.tableObject.view.dataTable.row(rowNumber).data(row);
		
		return true;
	}
		
	// Add a row to table
	_addRow ( row = null )
	{
		this.tableObject.view.dataTable.row.add(row);
		
		return true;	
	}
	
	// Prepare for add or update
	_prepareAddOrUpdate ( row = null , options = {} )
	{
		var { nameColumn = 0 } = options; // jshint ignore:line
		
		// If no row provided, scrape from UI
		if (!row) 
		{
			row = this.scrape().row;
		}
		
		// Get name of row
		var name = row[nameColumn];
		
		// Make sure the name is valid
		if ((name === null) || /^\s*$/.test(name))
		{
			throw new TypeError("StormIapInterface/_prepareAddOrUpdate no name provided [" + row.toSource() + "]");
		}
		
		// Does the row exist?
		var rowNumber = this.lookup(name);
		
		// Name of this type of object
		var typeName = StormUtility.upperFirst(this.type);
		
		// Action to take
		var add = (rowNumber === null);
		var update = (rowNumber !== null);
		
		// Return this information to caller
		var answer = { name : name , row: row , rowNumber : rowNumber , typeName : typeName , add : add , update : update };
		
		return answer;
	}
	
	// Add row to table
	addOrUpdateRow ( candidate = null , options = {} , transform = null )
	{
		var { nameColumn = 0 , ignoreUpdate = false , allowUpdate = true , askUpdate = false } = options; //jshint ignore:line
		var descriptor = this._prepareAddOrUpdate(candidate, { nameColumn : nameColumn });
		var { name , row , rowNumber , typeName , add } = descriptor;
		var inquiry;
		
		// Allows a subclass to specify a transformation function for data
		if (transform instanceof Function)
		{
			({row = [], inquiry = null , ignoreUpdate = false , allowUpdate = true , askUpdate = false } = //jshint ignore:line
				transform.call(this, row, descriptor, options));  //jshint ignore:line
		}
		
		// Ask custom inquiry if necessary
		if (!inquiry || confirm(inquiry))
		{
			// Add a new row
			if (add)
			{
				this.tableObject.view.dataTable.row.add(row);
			}
			
			// Update not permitted or cannot be ignored
			else if (!allowUpdate && !ignoreUpdate)
			{
				throw new TypeError("StormIapInterface/addRow attempt to update existing row '" + name + "'");
			}
			
			// Updated permitted, so ask or just add it 
			else if (!askUpdate || confirm(typeName + " '" + name + "' will be updated, is this OK?"))
			{
				this.tableObject.view.dataTable.row(rowNumber).data(row);
			}
		}

		// After action functions
		this.postProcessor.call(this, this, descriptor);
		this.ready("inline-block");
		this.tableObject.view.dataTable.draw();		
		
		return this;
	}
		
	// Set the ready element
	ready ( forceState = null )
	{
		var answer = null;
		var target;
		var valid = { "none" : true , "inline-block" : true };
		
		if (!this.readyElement)
		{
			console.log(this.constructor.name + "/ready called with no this.readyElement");
		}
		else
		{
			answer = this.readyElement.css("display");
			
			if (forceState && (forceState in valid))
			{
				target = forceState;
				
				console.log(this.constructor.name + "/ready forcing ready state to '" + target + "'");
			}
			else
			{
				target = (answer === "none") ? "inline-block" : "none";
				
				console.log(this.constructor.name + "/ready toggling from '" + answer + "' to '" + target + "'");
			}
				
			this.readyElement.css("display", target).trigger("change");
		}
		
		return answer;
	}

	// Reset the UI after we've done something
	reset ( )
	{
		this.nameElement.val(null);
		this.processObject.reset().update();
		this.ready("none");
		this.tableObject.view.dataTable.clear().draw();
		
		this.row = null;
		
		return this;
	}
	
	// Get information from the CRUD component
	scrape ( )
	{
		var name, descriptor;
			
		// Get the name for the new row
		name = this.nameElement.val();
		
		// Warn user if the name is empty
		if ((name === null) || /^\s*$/.test(name))
		{
			alert("You did not provide a " + this.type + " description");
		}
		else
		{
			// Scrape the values from the process UI
			descriptor = this.processObject.update().descriptor();
			descriptor.description = name;
			
			this.row = this.rowGenerator.call(this , descriptor);
		}
		
		return this;
	}
	
	// Load information into CRUD component
	spreadUi ( row )
	{
		// Convert an array of values into an object
		var object = this.tableObject.view.rowTemplate.ingest(row).descriptor;
		
		// Update the process with the values from the row object
		this.processObject.set(object).materialize();	
		
		// Set the name element
		$(this.nameElement).val(object.name);
		
		return this;
	}
	
	// Load information into the DataTable
	spread ( rows , options = { allowUpdate : true , askUpdate : false , clear : true })
	{
		if (!(rows instanceof Array))
		{
			console.log("StormIapInterface/spread rows is not an array:", rows);
		}
		else
		{
			if (options.clear)
			{
				this.tableObject.view.dataTable.clear();
			}
			
			for (var row of rows)
			{
				this.addOrUpdateRow(row, { allowUpdate : options.allowUpdate , askUpdate : options.askUpdate });
			}
		}
		
		return this;
	}
	
	// Update the associated process
	update ( )
	{
		return this.processObject.update();
	}
}

//*****************************************************************************
//* STORM object property descriptor
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormPropertyDescriptor
{
	constructor ( initializer )
	{
		this.defaultValue = StormUtility.getDefault(initializer, "default", null);
		this.helpText = StormUtility.getDefault(initializer, "helpText" , null);
		this.set = StormUtility.getDefault(initializer, "set", this.defaultSet);
		this.private = StormUtility.getDefault(initializer, "private", false);		
	}
	
	// Perform a set
	set ( value )
	{
		var answer;
		
		// Private properties can only be set to the default value
		if (this.private)
		{
			answer = this.defaultValue;
		}
		
		// Function supplied to set value
		else if (this.set instanceof Function) 
		{
			answer = this.set(value);
		}
		
		// Specific value provided
		else if (this.set !== undefined) 
		{
			answer = value;
		}
		
		// All other cases use default
		else
		{
			answer = this.defaultValue;
		}
		
		return answer;
	}
	
	// Default seter
	defaultSet ( value )
	{
		return (value !== undefined) ? value : this.defaultValue;
	}
	
	// Force a numeric value
	floatSet ( value )
	{
		return !isNaN(value) ? parseFloat(value) : this.defaultValue;
	}
	
	// Force a boolean value
	booleanSet ( value )
	{
		return ((typeof value === "boolean") ? value : (value ? true : false));
	}
	
	// Force an integer value
	integerSet ( value )
	{
		return !isNaN(value) ? parseInt(value) : this.defaultValue;
	}
	
	// Force a list value
	listSet ( value )
	{
		return [].concat(value ? value : []);
	}
	
	// Force an object value
	objectSet (  value )
	{
		return Object.assign({}, (value ? ((value instanceof Object) ? value : {}) : {}));
	}
}

//*****************************************************************************
//* Basic STORM risk mode (RM) calculator
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormCalculator 
{
	// Initialize a STORM calculator
	constructor ( initializer )
	{
		var valid = 
		{
			"scale" : { default: 100 , set: function ( value ) { return !isNaN(value) ? parseFloat(value) : 100; }} ,
			"scaling" : { default: false , set: function ( value ) { return (typeof value === "boolean") ? value : false; }}, 
			"vmax" : { default: 1.0 , set: function ( value ) { return !isNaN(value) ? parseFloat(value) : 1.0; }}, 
			"precision" : { default: null , set: function ( value ) { return !isNaN(value) ? parseInt(value) : null; }} ,
			"base" : { default: 5 , set: function ( value ) { return !isNaN(value) ? parseFloat(value) : 5; }} ,
			"current" : { default: 1 , set: function ( value ) { return !isNaN(value) ? parseFloat(value) : 1; }} ,
			"selector" : { default: null , set: function ( value ) { return (value !== undefined) && (value !== null) ? value : null; }} ,
			"list" : { default: [] , set: function ( value ) { return [].concat(value ? value : []); }}
		};
		
		StormUtility.applyPropertyInitializer(this, valid, initializer);
	}
	
	// Reset the internal values
	reset ( )
	{
		this.list = [];
		this.result = null;
		
		return this;
	}
	
	// Method to scale a value - CANNOT BE CHAINED
	scalify ( value )
	{
		if (value === undefined)
		{
			value = this.result;
		}
		
		var answer = StormUtility.scalify(value, this.scale);
		
		return answer;
	}
	
	// Method to round a value to precision - CANNOT BE CHAINED
	precisify ( value , numeric ) 
	{
		if (value === undefined)
		{
			value = this.result;
		}
		
		var answer = StormUtility.precisify(value, this.precision, numeric);
		
		return answer;
	}
	
	// Set the precision we are to use for non-scaled values
	setPrecision ( precision )
	{
		if ((precision === undefined) || (precision === null) || isNaN(precision))
		{
			precision = null;
		}
		else
		{
			precision = parseInt(precision);
		}
		
		this.precision = precision;
		
		return this;
	}
	
	// Indicate we are to return scaled values
	setScaling ()
	{
		this.scaling = true;
		
		return this;
	}
	
	// Indicate we are to return probability values
	clearScaling ()
	{
		this.scaling = false;
		
		return this;
	}
	
	// Add a factor to the list
	add ( factor )
	{
		if (!(factor instanceof jQuery) && (factor.constructor.name !== "_Api"))
		{
			if (this.selector !== null)
			{
				this.list.push(factor);
			}
			else
			{
				this.list = this.list.concat(factor);
			}
		}
		else
		{
			for (var pointer = 0, factors = factor.length; pointer < factors; pointer++)
			{
				this.list.push(factor[pointer]);
			}
		}
		
		return this;
	}
	
	// Sort STORM factors by selector
	factors ( )
	{
		var self = this;
		var selector = self.selector;
		
		var answer = this.list.sort(function ( one , two )
		{
			var first = (selector === null) ? one : one[selector];
			var second = (selector === null) ? two : two[selector];
			var answer;
			
			if (isNaN(first) || isNaN(second))
			{
				throw new TypeError("StormCalculator/factors selector \"" + self.selector + "\" yields non-numeric");
			}
			else
			{
				answer = second - first;
			}
			
			return answer;
		});
		
		return answer;
	}
	
	// Generate the limit of this function
	limit ( )
	{
		this.aggregate(Array(this.scale).fill(this.vmax));

		return this;
	}
		
	// Generate an aggregate
	aggregate ( override )
	{
		var factors = (override instanceof Array) ? override : this.factors();
		var power = 0;
		var total = 0;
		var answer = 0;
		var divisor = this.base - this.current;
		var selector = this.selector;
		
		for (var factor of factors)
		{
			total += ((selector === null) ? factor : factor[selector]) / Math.pow(divisor, power);
			
			power++;
		}
		
		if (this.scaling)
		{
			answer = this.scalify(total);
		}
		else if (this.precision === null)
		{
			answer = total;
		}
		else
		{
			answer = this.precisify(total);
		}
		
		this.result = answer;
		
		return this;
	}
}

//*****************************************************************************
//* STORM IAP factor choice
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapChoice 
{
	constructor ( initializer ) 
	{
		var valid =
		{
			"value" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"label" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"action" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} , 
			"color" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"weight" : { default : 1 , set: function ( value ) { return (value !== undefined) ? value : 1; }} ,
			"range" : { default : {} , set: function ( value ) { return (value !== undefined) ? value : {}; }}
		};
		
		StormUtility.applyPropertyInitializer(this, valid, initializer);
	}
	
	// Return a name for this choice
	get name ()
	{
		var answer = StormUtility.camel(this.label);
		
		return answer;
	}
}

//*****************************************************************************
//* STORM IAP factor choice map
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapChoiceMap extends StackMap 
{
	constructor ( initializer = [] , maximum = null ) 
	{
		super(null, StormIapChoice, "label", null);
		
		for (var candidate of initializer)
		{
			this.add(candidate, { preprocess : this._setValue } );
		}
		
		this._maximum = maximum;
	}
	
	// Make sure a value is set for a choice - StackMap environment (this)
	_setValue ( candidate , key , position )
	{
		if (!("value" in candidate) || (candidate.value === null) || (candidate.value === undefined))
		{
			candidate.value = position + 1;
		}
		
		return candidate;
	}

	// Return a choice based on its value
	search ( value )
	{
		var generator = this.stackGenerator();
		var answer, result, choice = null;
		
		do 
		{
			result = generator.next();
			
			if (result)
			{
				choice = result.value;
				
				if (choice && (choice.value === value))
				{
					answer = choice;
					break;
				}
			}
		} 
		while (result && !result.done);
		
		return answer;
	}
	
	// Return a slice of data for all choies
	slice ( property , prototype = [] )
	{
		var answer = [];
		var position = 0;
		
		for (var choice of this.stackGenerator())
		{
			var value, missing;
			
			if (property in choice)
			{
				value = choice[property];
				missing = false;
			}
			else
			{
				value = undefined;
				missing = true;
			}
			
			if (prototype instanceof Array)
			{
				answer.push(value);
			}
			else
			{
				var descriptor = { index: position , label: choice.label , property: property,  value: value , missing: missing };	
				answer.push(descriptor);
			}
		}
		
		return answer;
	}
	
	// Return maximum for this choice map
	get maximum ()
	{
		var answer;
		var maximum = this._maximum;
		
		if ((maximum === null) || (maximum === undefined))
		{
			answer = this.length;	
		}
		else if (!isNaN(maximum))
		{
			answer = parseFloat(maximum);	
		}
		else if (maximum instanceof Function)
		{
			answer = maximum.call(this);
		}
		
		return answer;
	}
}

/**
* A factor in a STORM IAP process. A "factor" is a set of choices that yields a
* single, deterministic, quantitative (numeric) VALUE, and a DESCRIPTOR which 
* contains the data required to arrive at that value.
* @class
* @param {Object} initializer - a set of options for the object 
* @param {Boolean} materialize - automatically materialize the UI as part of the construction
* @param {String} initializer.name - a short name or label to be associated with factor in UI
* @param {String} initializer.type - the type of control associated with the factor (slider, checkbox, etc.)
* @param {Number|Function} initializer.weight - the weight to be applied to this factor
* @param {jQuery} initializer.controlElement - the element to contain the control(s)
* @param {String} initializer.controlSelector - a class name or other jQuery selector to confirm the control's identity (can be null)
* @param {jQuery} initializer.valueElement - a DOM element to receive the value of the process automatically when it's update
* @param {jQuery} initializer.processElement - a DOM element to be triggered with "change"
* @param {String} initializer.group - the name for a group of factors
* @param {StromIapChoiceMap} initializer.choices - a list of choices for the factor
*/
class StormIapFactor
{
	// Constructor
	constructor ( initializer , materialize = true )
	{		
		this.descriptor = {};
		this.options = {};
		this.initialized = false;
		this.materalized = false;
		
		var valid = 
		{
			"name" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"type" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"weight" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"controlElement" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"controlSelector" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"valueElement" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"processElement" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"group" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"choices" : { 
				default: new StormIapChoiceMap([]) , 
				set: function ( value ) { return (value instanceof StormIapChoiceMap) ? value : new StormIapChoiceMap([]); }
			} 
		};
		
		StormUtility.applyPropertyInitializer(this, valid, initializer);
		
		for (var [ name, element ] of [ [ "control", this.controlElement] , [ "value" , this.valueElement ] , [ "process" , this.processElement ] ])
		{
			var cache = $(element);
			
			if (cache.length === 0)
			{
				throw new ReferenceError("StormIapFactor/constructor " + name + " element '#" + cache.prop("id") + "' does not exist in document");
			}
		}
		
		if (this._validate())
		{	
			this.setContext();
		
			if (materialize)
			{
				this.materialize();
			}
		}
	}
	
	// Return a weight for this factor
	weighting ()
	{
		var answer;
		
		// No property
		if (!("weight" in this))
		{
			answer = 1;
		}
		
		// Null, undefined, or 0 is not allowed
		else if (!this.weight)
		{
			answer = 1;
		}
		
		// Function call
		else if (this.weight instanceof Function)
		{
			answer = this.weight.call(this);
		}
		
		return answer;
	}
	
	// Required implementations
	// scrape, spread, value, set, maximum, initialize, and reset
	static required () 
	{
		const required = 
		{
			scrape : Function ,
			spread : Function ,
			value : Function ,
			set : Function ,
			maximum : Function ,
			initialize : Function ,
			reset : Function 
		};
		
		return required;
	}
	
	// Verify all required implementations are available
	_validate ( )
	{
		var missing = [];
		
		for (var [method , className] of Object.entries(StormIapFactor.required()))
		{
			if (!(this[method] instanceof className))
			{
				missing.push(method);
			}
		}
		
		if (missing.length > 0)
		{
			throw new ReferenceError("StormIapFactor/_validate missing methods " + missing.join(","));
		}
		
		return true;
	}
	
	// Return environemnt information for multi-environment methods
	static selectEnvironment ( object )
	{		
		var answer = { self: null , cache: null };
		
		if (object instanceof StormIapFactor)
		{
			answer.self = object;
			answer.cache = object.controlElement;
		}
		else
		{
			answer.self = StormIapFactor.getContext(object);
			answer.cache = $(object);
		}
		
		return answer;
	}
	
	// Set the context 
	setContext ( element )
	{
		var target = element ? element : this.controlElement;
		
		target.data("StormIapFactor", this);
	
		return this;
	}
	
	// Get the contet
	static getContext ( element )
	{
		var self = $(element).data("StormIapFactor");
		
		return self;
	}
	
	/** 
	* Initialize the factor's control. This method cannot be called in the abstract, but must be overridden in subclasses
	* @method
	* @returns {StormIapFactor} The current StormIapFactor object (this) to facilitate chaining
	*/
	initialize ()
	{
		throw new ReferenceError("StormIapFactor/initialize called in the abstract");
				
		return this; // jshint ignore:line 
	}
	
	/** 
	* Read the factor's interface and internal state. This method cannot be called in the abstract, 
	* but must be overridden in subclasses
	* @method
	* @property {Object} this.descriptor - a description of the state of the object
	* @returns {StormIapFactor} The current StormIapFactor object (this) to facilitate chaining
	*/
	scrape ( )
	{
		throw new ReferenceError("StormIapFactor/scrape called in the abstract");
				
		return this; // jshint ignore:line
	}
	
	/** 
	* Reset the factor's interface to a default state.
	* This method cannot be called in the abstract, but must be overridden in subclasses
	* @method
	* @property {Object} this.descriptor - a description of the state of the object
	* @returns {StormIapFactor} The current StormIapFactor object (this) to facilitate chaining
	*/
	reset ( ) 
	{
		throw new ReferenceError("StormIapFactor/reset called in the abstract");
				
		return this; // jshint ignore:line
	}
	
	/** 
	* Set the factor's interface and internal state FROM its descriptor, or a supplied descriptor 
	* This method cannot be called in the abstract, but must be overridden in subclasses
	* @method
	* @param {Object} descriptor - a description of the state of the object (overrides this.descriptor)
	* @property {Object} this.descriptor - a description of the state of the object
	* @returns {StormIapFactor} The current StormIapFactor object (this) to facilitate chaining
	*/
	spread ( ) 
	{
		throw new ReferenceError("StormIapFactor/spread called in the abstract");
				
		return this; // jshint ignore:line
	}
	
	/** 
	* This is the scalar numeric value of the factor, a REQUIREMENT. The value is a function of the values in the factor's descriptor, and 
	* this may be a one-way function (you may not be able to recover a descriptor from a value). This method CANNOT be chained.
	* @method
	* @param {Object} descriptor - a description of the state of the objec (overrides this.descriptor)
	* @returns {number} The current scalar number value for the factor 
	*/
	value ()
	{
		throw new ReferenceError("StormIapFactor/value called in the abstract");
		
		return this; // jshint ignore:line
	}

	/**
	* Set the fator FROM its scalar numeric value. Some factors are not reversible. This method cannot be called in the abstract,
	* but must be overriden in subclasses.
	* @method
	* @returns {number} The PREVIOUS state of the factor, if applicable
	*/
	set ( value = null ) // jshint unused:false
	{
		throw new ReferenceError("StormIapFactor/set called in the abstract");
		
		return this; // jshint ignore:line
	}
	
	/** 
	* This is the MAXIMUM possible scalar numeric value, a REQUIREMENT. This method CANNOT be chained.
	* @method
	* @param {Object} descriptor - a description of the state of the objec (overrides this.descriptor)
	* @property {Object} this.descriptor - a description of the state of the object
	* @returns {number} The maximum scalar value for this factor 
	*/
	maximum ()
	{
		throw new ReferenceError("StormIapFactor/maximum called in the abstract");
		
		return this; // jshint ignore:line
	}
	
	// Return the choice based on the value
	choice ()
	{
		var value = this.value();
		var choice = this.choices.search(value);
		
		return { value: value , choice: choice };
	}
	
	// Set the value element 
	setValueElement ( choice )
	{
		if (this.valueElement instanceof jQuery)
		{
			this.valueElement.text(choice.label).css("color", choice.color);
		}
		
		return this;
	}
	
	// Handle an update event from the control (change, click, etc.) - jQuery event handler environment <==
	update ()
	{
		var { self, cache } = StormIapFactor.selectEnvironment(this);		
		var { value, choice } = self.choice();
			
		if (!choice)
		{
			console.log("StormIapFactor/update choice has dubious null or undefined value--nothing will change");
		}
		else
		{
			if (choice.action instanceof Function)
			{
				choice.action.call(self, cache, choice, value);
			}
			
			self.scrape();
			
			self.setValueElement(choice);
			
			if (self.processElement instanceof jQuery)
			{
				self.processElement.trigger("change");
			}
		}
	}
	
	// Return a name by which this factor can be referenced - CANNOT BE CHAINED
	key ( )
	{
		var answer = StormUtility.camel(this.name);
		
		return answer;
	}
		
	// Instantiate the control
	materialize ( )
	{
		var element = this.controlElement;
		
		if (element)
		{
			this.setContext(element);

			if (!element.is(this.controlSelector))
			{
				this.initialize();
			}
			
			this.update.call(element);
		}
	}
}

/**
//* A STORM IAP factor implemented using a discrete "slider" UI control.
* @class
*/
class StormIapFactorSlider extends StormIapFactor
{
	// Construct slider factor
	constructor ( initializer , materialize = true )
	{
		initializer = Object.assign(initializer, 
			{ 
				"controlSelector" : ".ui-slider" ,
				"type" : "slider" 
			});
		
		super(initializer, materialize);
	}
	
	// Return value (position) of control 1..n
	_controlValue ( set = null )
	{
		if (set !== null) 
		{
			this.controlElement.slider("value", set);
		}
		
		return this.controlElement.slider("value");
	}
	
	// Get the value of the position (which is arbitrary)
	_positionValue ( position = 1 )
	{
		var map = this.choices.slice("value");
		var index = position > 0 ? position - 1 : 0;
		var value = map[index] !== undefined ? map[index] : position;
		
		return value;
	}
	
	// Get the position of a value 1...n
	_valuePosition ( value = 1 )
	{
		var map = this.choices.slice("value");
		var index = map.indexOf(value);
		var position = index >= 0 ? index +  1 : 1;
		
		return position;
	}
		
	// Initialize slider
	initialize ( )
	{
		this.controlElement.slider({
			"min" : 1 ,
			"max" : this.choices.maximum ,
			"step" : 1 ,
			"value" : 1 ,
			"slide" : this.update ,
			"change" : this.update ,
		});
		
		return this;
	}
	
	// Get slider descriptor
	scrape ( ) 
	{
		var { self } = StormIapFactor.selectEnvironment(this);
		var position = self._controlValue();
		var value = self._positionValue(position);	

		self.descriptor =
		{
			name: self.key() ,
			type: self.type ,
			weight: self.weight ,
			position : position ,
			value: value
		};
		
		return this;
	}
	
	// Reset to default state (1 for all sliders)
	reset ( )
	{
		return this.spread({ position: 1 });
	}
	
	// Set slider according to descriptor
	spread ( descriptor = null )
	{
		if (descriptor instanceof Object) 
		{ 
			this.descriptor = Object.assign(this.descriptor, descriptor);
		}
		else
		{
			this.scrape();
			
			if (!isNaN(descriptor) && (descriptor > 0))
			{
				console.log("(W) StormIapFactorSlider/spread called in place of set with " + descriptor);
				
				this.descriptor.position = descriptor;
			}
		}
		
		var value = this.descriptor.position;
		var position = this._valuePosition(value);
		
		this._controlValue(position);
		
		return this;
	}
	
	// Return the scalar numeric value
	value ( descriptor = null )
	{
		var source = descriptor ? descriptor : this.scrape().descriptor;
		var answer = source.value;
		
		return answer;
	}
	
	// Set based on scalar numeric value
	set ( newValue = null )
	{
		var oldPosition, oldValue, newPosition;
		
		oldPosition = parseInt(this._controlValue());
		oldValue = this._positionValue(oldPosition);
		newValue = !isNaN(newValue) && (newValue >= 0) ? parseInt(newValue) : 0;
		newPosition = this._valuePosition(newValue);
				
		this.spread({ position: newPosition });
		
		return oldValue;
	}
	
	// Return the maximum scalar numeric value
	maximum ( )
	{
		return this.choices.length;
	}
}

//*****************************************************************************
//* STORM IAP Factor Using Checkboxes 
//* - controlElement should be a <div>
//* - scrape, spread, value, set, maximum, initialize, and reset
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapFactorCheckbox extends StormIapFactor
{
	// Construct slider factor
	constructor ( initializer )
	{
		initializer = Object.assign(initializer,
		{
			"type" : "checkbox" ,
			"controlSelector" : ".stormFactor" ,
		});
		
		super(initializer, false);
		
		this.materialize();
	}
	
	// Set up the checkboxes from choices - jQuery UI environment
	initialize ( )
	{
		var { self }  = StormIapFactor.selectEnvironment(this);
		var inputName = self.key();
		var className = StormUtility.undot(self.controlSelector);
		
		self.controlElement.empty().addClass(className);
		self.choices.reset();
		
		while (self.choices.next())
		{
			var choice = self.choices.current();
			var inputId = inputName + "_" + choice.name;
			var value = choice.value;
			
			self.controlElement.append(
				$("<label>", { for : inputId }).html(choice.label) ,
				$("<input>", { type: "checkbox" , id: inputId , name: inputName , value : value }).
					data("StormIapChoice", choice).
					on("click", self.check)
			);	
		}
		
		this.scrape();
	}
	
	// Process the check/uncheck action - jQuery UI environment
	check ( )
	{
		var cache = $(this);
		var self = cache.parent().data("StormIapFactor");
		var choice = cache.data("StormIapChoice");
		var value = cache.val();
		
		if (choice.action instanceof Function)
		{
			choice.action.call(self, cache, choice, value);
		}
		
		self.update();
	}
	
	// Get value from checkboxes - jQuery UI environment
	scrape ( )
	{
		var { self } = StormIapFactor.selectEnvironment(this);
		var answer = { name : this.key() , type: this.type , weight: this.weight , checkboxes : {} };
		
		self.controlElement.find("input[type=checkbox]").each( function () 
		{
			var id = this.id;
			var box = $(this);
			var value = box.is(":checked") ? box.val() : null;
				
			answer.checkboxes[id] = value;
		});
		
		this.descriptor = answer;
		
		return this;
	}
	
	// Return the numeric value of the control
	value ( )
	{
		var calculator = new StormCalculator({ vmax: 10 , scale: 10 });
		var source = this.descriptor;
		
		for (var checkbox in source.checkboxes)
		{
			var value = source.checkboxes[checkbox];
			
			if (value)
			{
				calculator.add(value);
			}
		}
		
		var final = calculator.aggregate().result;
		
		if (final <= 0)
		{
			final = 1;
		}
		
		return final;
	}
	
	// Checkbox settings are not, strictly speaking, reversible from the scalar value
	set ( )
	{
		throw new TypeError("StormIapFactorCheckbox/set checkbox factors are not reversible");		
	}
	
	// Reset to default state
	reset ( )
	{
		return this.spread({ checkboxes: {} }, true);
	}
	
	// Set boxes - jQuery UI environment
	spread ( descriptor = null , reset = true )
	{
		var { self } = StormIapFactor.selectEnvironment(this);
		var source = descriptor && ("checkboxes" in descriptor) ? descriptor : this.descriptor;
		
		if (reset)
		{
			self.controlElement.find("input[type=checkbox]").prop("checked", false);
		}
		
		for (var [ id , value ] of Object.entries(source.checkboxes))
		{
			$("#" + id).prop("checked", (value !== null));
		}
		
		self.choice();
		
		return this;
	}
	
	// Choice processing is more complex for checkboxes
	choice ( ) 
	{
		var value = this.scrape().value();
		var valueMap = 
		{ 
			1.0 : new StormIapChoice({ color: StormUtility.standardColor("green") , label: "None" }), 
			3.0 : new StormIapChoice({ color: StormUtility.standardColor("blue") , label: "Moderate" }) ,
			5.0 : new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Significant" }) ,
			7.0 : new StormIapChoice({ color: StormUtility.standardColor("orange") , label: "Extensive" }) ,
			10.0 : new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Pervasive" })
		};
		
		for (var [ cutoff , choice ] of Object.entries(valueMap))
		{
			if (value <= cutoff)
			{
				break;
			}
		}
		
		if (this.valueElement instanceof jQuery)
		{
			this.valueElement.text(choice.label).css("color", choice.color);
		}
		
		return { value : value , choice : choice };
	}
	
	// Compute maximum value for this factor - "this" is a StormIapChoiceMap
	maximum ()
	{
		var calculator = new StormCalculator({ scale : 10 , vmax :  10 });
		var choices = (this instanceof StormIapFactor) ? this.choices.stack : this.stack;
		var answer;
				
		for (var choice of choices)
		{
			calculator.add(choice.value);
		}
				
		answer = calculator.aggregate().result;
		
		return answer;
	}
}

//*****************************************************************************
//* STORM IAP Factor Using Selection List 
//* - controlElement should be a <select>
//* - scrape, spread, value, set, maximum, initialize, and reset
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapFactorSelector extends StormIapFactor
{
	// Construct selector factor
	constructor ( initializer )
	{
		initializer = Object.assign(initializer,
		{
			"type" : "select" ,
			"controlSelector" : ".stormFactor" ,
		});
		
		super(initializer, false);
		
		this.choiceGenerator = initializer.choiceGenerator;
		this.materialize();
	}
	
	// Set up the selector from a choice generator  - jQuery UI environment
	initialize ( )
	{
		var { self }  = StormIapFactor.selectEnvironment(this);
		var className = StormUtility.undot(self.controlSelector);
		
		// Make sure we will be recognized
		this.controlElement.addClass(className);

		self.setChoices(false, className);	
		self.spread({ position : []});	
		self.scrape();
	}
	
	// Set choices
	setChoices ( union = false , className = ".stormFactor" ) 
	{
		var inputName = this.key();
		var choices, openAction;
		
		// Clear everything out if NOT a union operation
		if (!union)	
		{
			this.controlElement.empty();
		}
		
		// We have a choice generator?
		if (this.choiceGenerator instanceof Function)
		{
			choices = this.choiceGenerator.call(this, inputName, className);
			openAction = this.focus;
		}
		
		// Static list of choices
		else if (this.choices.length > 0)
		{
			choices = this.choices;
			openAction = null;
		}
		
		// None of the above
		else
		{
			throw new ReferenceError("StormIapFactorSelector/setChoices missing choiceGenerator or choices property");
		}
		
		// Set the choices property
		this.choices = choices;
		
		// Iterate through the choices
		var generator = choices.stackGenerator();
		
		for (var choice of generator)
		{
			var inputId = inputName + "_" + choice.name;
			var value = choice.value;
			var exists = this.controlElement.find("option[value='" + value + "']").length > 0;
			
			if (!union || !exists)
			{
				this.controlElement.append(
					$("<option>", { id: inputId , name: inputName , value : value }).
						text(choice.label).
						data("StormIapChoice", choice)
				);	
			}
		} 
		
		// Value element not used
		this.valueElement.css("display", "none");
		
		// Set up the control element
		if (this.controlElement.selectmenu("instance") === undefined)
		{
			this.controlElement.selectmenu({ change: this.select , open: openAction , width: "15em" });
		}
		else
		{
			this.controlElement.selectmenu("refresh");
		}
	
		return this;
	}
	
	// Process a focus operation -- this will import data using the choiceGenerator if one is defined
	// jQuery UI environment
	focus ( )
	{
		var cache = $(this);
		var self = cache.data("StormIapFactor");
		
		if (self.choiceGenerator instanceof Function)
		{
			self.setChoices(true);
		}
	}
	
	// Process the select operation - jQuery UI environment
	// "this" is the <select> element with data("StormIapFactor")
	// selected <option> contains data("StormIapChoice")
	select ( )
	{
		var cache = $(this);
		var self = cache.data("StormIapFactor"); 
		var choice = cache.find(":selected").data("StormIapChoice");
		var value = cache.val();
		
		if (choice.action instanceof Function)
		{
			choice.action.call(self, cache, choice, value);
		}
		
		self.update();
	}
	
	// Get value from selector - jQuery UI environment
	scrape ( )
	{
		var { self } = StormIapFactor.selectEnvironment(this);
		var answer = { name : this.key() , type: this.type , weight: this.weight , position : [] };
		
		self.controlElement.find("option:selected").each( function () 
		{
			var box = $(this);
			var value = box.text();
				
			answer.position.push(value);
		});
		
		this.descriptor = answer;
		
		return this;
	}
	
	// Return the numeric value of the control
	value ( )
	{
		var value = this.controlElement.val();
		
		return value;
	}
	
	// Selectable should be reversible
	set ( value )
	{
		this.controlElement.val(value);
		this.controlElement.selectmenu("refresh");		
		
		return this;
	}
	
	// Reset to default state
	reset ( )
	{
		this.setChoices();
		this.spread({ position: [] }, true);
		
		return this;
	}
	
	// Set selector - jQuery UI environment
	spread ( descriptor = { position : [] } , reset = true )
	{
		var { self } = StormIapFactor.selectEnvironment(this);
		var source = descriptor && ("position" in descriptor) ? descriptor : this.descriptor;
		
		if (reset)
		{
			self.controlElement.find("option:selected").prop("selected", false);
		}
		
		var values = source.position instanceof Array ? source.position : [ source.position ];
						
		for (var value of values)
		{
			self.controlElement.val(value);
		}
		
		self.controlElement.selectmenu("refresh");
		//self.choice();
		
		return this;
	}
	
	// Choice processing
	choice ( ) 
	{
		this.setChoices(true);
		
		var value = this.scrape().value();
		var choice = this.choices.search(value);
		
		return { value : value , choice : choice };
	}
	
	// Compute maximum value for this factor - "this" is a StormIapChoiceMap
	maximum ()
	{		
		return 1;
	}
}

//*****************************************************************************
//* STORM IAP Process - Master Interface
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapMaster
{
	constructor ( { assets = null , threats = null , vulnerabilities = null , controls = null } = {} ) // jshint ignore:line
	{
		self.assets = assets;
		self.threats = threats;
		self.vulnerabilities = null;
		self.controls = null;
	}
}

//*****************************************************************************
//* STORM IAP Process - Abstract Class
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormIapProcess 
{
	constructor ( initializer ) 
	{
		var valid =
		{
			"name" : { default: null , set: function ( value ) { return (value !== undefined) ? value : null; }} ,
			"template" : { default: false , set: function ( value ) { return (typeof value === "boolean") ? value : false; }} ,
			"factors" : { default: [] , set: function ( value ) { return (value instanceof Array) ? value : []; }} ,
			"updateAction" : { default: null , set: function ( value ) { return (value instanceof Function) ? value : this.update; }} ,
			"element" : { default: $(document) , set: function ( value ) { return (value !== undefined) ? $(value) : $(document); }} ,
			"_total" : { default: 0 , set: 0 } ,
			"_maximum" : { default: 0 , set: 0 } ,
			"_value" : { default: 0 , set: 0 } ,
		};
				
		StormUtility.applyPropertyInitializer(this, valid, initializer);
		
		// Save the initializer for this.reset()
		this._valid = valid;
		this._initializer = initializer;
		
		// So we can find ourselves
		this.setContext();	
		
		// Track changes on process element
		this.element.on("change", this.update);
	}
	
	// Reset the object to its original state
	reset ()
	{
		StormUtility.applyPropertyInitializer(this, this._valid, this._initializer);
		
		for (var factor of this.factors)
		{
			factor.reset();
		}
		
		return this;
	}
	
	// Set context
	setContext ()
	{
		this.element.data("StormIapProcess", this);
		
		return this;
	}
	
	// Get context
	static getContext ( element )
	{
		var self = $(element).data("StormIapProcess");
		
		return self;
	}
	
	// Update the process values - CANNOT BE CHAINED _IF_ explicit !== {}
	compute ( )
	{
		var answer = this;
		var factors = this.factors;
		var maximum = 1;
		var total = 1;
		
		for (var factor of factors)
		{
			maximum *= factor.maximum() * factor.weighting();
			total *= factor.value() * factor.weighting();
		}
		
		answer._maximum = maximum;
		answer._total = total;
		answer._value = total / maximum;
				
		return answer;
	}
	
	// Return the value of the process - CANNOT BE CHAINED
	value () 
	{		
		return this._value;
	}
	
	// Return the process factors and values - CANNOT BE CHAINED
	descriptor ( )
	{
		this.update();
		
		var factorList = {};
		var factorStatus = {};
		var answer;
		
		for (var factor of this.factors)
		{
			var factorName = StormUtility.camel(factor.name);
			var factorValue = factor.value();
			
			factorList[factorName] = factorValue;
			factorStatus[factorName] = factor.scrape();
		}
		
		answer = 
		{ 
			"name" : this.name ,
			"template" : this.template ,
			"value" : this._value ,
			"maximum" : this._maximum ,
			"total" : this._total ,
			"factors" : factorList ,
			"status" : factorStatus
		};
	
		return answer;	
	}
	
	// Set the values of all the defined factors
	spread ( values ) { return this.set(values); }
	set ( values = {} )
	{
		for (var factor of this.factors)
		{
			var key = factor.key();
			
			if (key in values)
			{
				var value = values[key];
				
				factor.spread({ name: key, position: value});
			}
		}
		
		return this;
	}
	
	// Materialize the process UI
	materialize ()
	{
		for (var factor of this.factors)
		{
			factor.materialize();
		}
		
		return this;
	}
	
	// Update UI display
	update ()
	{
		console.log("StormIapProcess/display abstract called");
	}
}

//*****************************************************************************
//* STORM HAM533 threat assessment
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormHAM533 extends StormIapProcess 
{
	constructor ( element , prefix ) 
	{
		if ((prefix === undefined) || (prefix === null))
		{
			prefix = "";
		}
		
		var name = "HAM533";
				
		var factors = 
		[
			new StormIapFactorSlider({
				name: "History" ,
				controlElement: $("#" + StormUtility.camel(prefix, "history", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "history", "value")) ,
				processElement: $(element) ,
				group: null ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Improbable" }),
					new StormIapChoice({ color: StormUtility.standardColor("blue") , label: "Rare" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Occasional" }),
					new StormIapChoice({ color: StormUtility.standardColor("orange") , label: "Common" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Continuous" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Access" ,
				controlElement: $("#" + StormUtility.camel(prefix, "access", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "access", "value")) ,
				processElement: $(element) ,
				group: null ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Outsider Access" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Insider Access" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Privileged Access" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Means" ,
				controlElement: $("#" + StormUtility.camel(prefix, "means", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "means", "value")) ,
				processElement: $(element) ,
				group: null ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Individual" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Corporation" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Nation State" })
				])
			}) 
		];

		super({ element: element , name: name , factors: factors });
	
		this.probabilityElement = $("#" + StormUtility.camel(prefix, "probability", "value"));
		this.impactElement = $("#" + StormUtility.camel(prefix, "impact", "value"));
	}
	
	// Reset the object
	reset ()
	{
		super.reset();
		
		this._impact = 0;
		this._probability = 0;
		
		return this;
	}
	
	// HAM533 impact nominator - CANNOT BE CHAINED
	_computeImpact ()
	{
		var factors = this.factors;
		var total = factors[0].choices.length * factors[1].value() * factors[2].value();
		var answer = total / this._maximum;
		
		return answer;
	}
	
	// Compute the values of the process
	compute ()
	{
		super.compute();
		
		this._impact = this._computeImpact();
		this._probability = this._value;
		
		return this;
	}
	
	// Return process and factors - CANNOT BE CHAINED
	descriptor ()
	{
		var answer = super.descriptor();
		
		answer.probability = this._probability;
		answer.impact = this._impact;
		
		delete answer.value;
		
		return answer;
	}
		
	// Update UI display
	update ()
	{
		var self = (this instanceof StormIapProcess) ? this : StormIapProcess.getContext(this);
		
		self.compute();
		
		var probability = StormUtility.precisify(self._probability, 4);
		var impact = StormUtility.precisify(self._impact, 4);
		
		self.probabilityElement.text(probability);
		self.impactElement.text(impact);
		
		return self;
	}
}

//*****************************************************************************
//* STORM CRVE3 vulnerability assessment
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormCRVE3 extends StormIapProcess 
{
	constructor ( element , prefix ) 
	{
		if ((prefix === undefined) || (prefix === null))
		{
			prefix = "";
		}
		
		var name = "CRVE3";
				
		var factors = 
		[
			new StormIapFactorSlider({
				name: "Capabilities" ,
				controlElement: $("#" + StormUtility.camel(prefix, "capabilities", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "capabilities", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Expert" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Skilled" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Unskilled" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Resources" ,
				controlElement: $("#" + StormUtility.camel(prefix, "resources", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "resources", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Nation State" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Corporation" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Individual" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Visibility" ,
				controlElement: $("#" + StormUtility.camel(prefix, "visibility", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "visibility", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Need to Know" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Insider Knowledge" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Public Knowledge" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Confidentiality Exposure" ,
				controlElement: $("#" + StormUtility.camel(prefix, "confidentiality", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "confidentiality", "value")) ,
				processElement: $(element) ,
				group: "CIA" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Minimal" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Moderate" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Extensive" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Integrity Exposure" ,
				controlElement: $("#" + StormUtility.camel(prefix, "integrity", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "integrity", "value")) ,
				processElement: $(element) ,
				group: "CIA" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Minimal" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Moderate" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Extensive" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Availability Exposure" ,
				controlElement: $("#" + StormUtility.camel(prefix, "availability", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "availability", "value")) ,
				processElement: $(element) ,
				group: "CIA" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "Minimal" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "Moderate" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Extensive" })
				])
			}) 
		];

		super({ element: element , name: name , factors: factors });
	
		this._exposure = 0;
		this._maximum = 0;
		this._total = 0;
		this.exposureElement = $("#" + StormUtility.camel(prefix, "exposure", "value"));
		this.calculator = new StormCalculator({ scale: 3 , vmax: 3 , precision: 4 });
	}
	
	// Reset object
	reset ()
	{
		super.reset();
		
		this._exposure = 0;
		this._maximum = 0;
		this._total = 0;
		
		return this;
	}
	
	// CRVE3 CIA group calculator - CANNOT BE CHAINED
	_computeCia ( explicit = {} )
	{
		var maximum, valid , factorKey , factor, aggregate, exposure, answer;
		
		this.calculator.reset();
	
		if (!StormUtility.empty(explicit))
		{
			valid = { confidentialityExposure : true , integrityExposure : true , availabilityExposure : true };
			
			for (factorKey in valid)
			{
				this.calculator.add(explicit.factors[factorKey]);
			}
		}
		else
		{
			for (factor of this.factors)
			{
				if (factor.group === "CIA")
				{
					this.calculator.add(factor.value());	
				}
			}
		}

		maximum = this.calculator.limit().result; 		
		aggregate = this.calculator.aggregate().result;
		exposure = aggregate / maximum;
			
		answer = { exposure: exposure, aggregate: aggregate, maximum: maximum };
		
		return answer;
	}
	
	// CRVE3 non-CIA group calcualtor - CANNOT BE CHAINED
	_computeBasic ( explicit = {} )
	{
		var maximum = 3*3*3, aggregate = 1, valid, factorKey , factor, exposure, answer;
		
		if (!StormUtility.empty(explicit))
		{
			valid = { capabilities : true , resources : true , visibility : true };
			
			for (factorKey in valid)
			{
				aggregate *= explicit.factors[factorKey];
			}
		}
		else
		{
			for (factor of this.factors)
			{
				if (factor.group === "basic")
				{	
					aggregate *= factor.value();
				}
			}
		}
		
		
		exposure = aggregate / maximum;
		answer = { exposure: exposure , aggregate: aggregate, maximum: maximum };
		
		return answer;
	}
			
	// Compute the values of the process
	compute ( explicit = {} )
	{
		var isExplicit = !StormUtility.empty(explicit);
		var cia = this._computeCia(explicit);
		var basic = this._computeBasic(explicit);
		var answer;
		
		var maximum = cia.maximum * basic.maximum;
		var aggregate = cia.aggregate * basic.aggregate;
		var exposure = aggregate / maximum;
		
		if (!isExplicit)
		{
			this._ciaValue = cia.exposure * cia.maximum;
			this._exposure = exposure;
			this._value = exposure;
			this._maximum = maximum;
			this._total = aggregate;
			
			answer = this;
		}
		else
		{
			answer = Object.assign({}, explicit);
			
			answer.ciaValue = cia.exposure * cia.maximum;
			answer.exposure = exposure;
			answer.value = exposure;
			answer.maximum = maximum;
			answer.total = aggregate;
		}
		
		return answer;
	}
	
	// Return process and factors - CANNOT BE CHAINED
	descriptor ( explicit = {} )
	{
		var answer = super.descriptor( explicit );
		
		answer.exposure = this._exposure;
		answer.maximum = this._maximum;
		answer.total = this._total;
		answer.ciaValue = this._ciaValue;
				
		delete answer.value;
		
		return answer;
	}
		
	// Update UI display
	update ()
	{
		var self = (this instanceof StormIapProcess) ? this : StormIapProcess.getContext(this);
		
		self.compute();
		
		var exposure = StormUtility.precisify(self._exposure, 4);
		
		self.exposureElement.text(exposure);
		
		return self;
	}
}

//*****************************************************************************
//* STORM SCEP vulnerability assessment
//* 
//* STORM is the intellectual property of RESCOR LLC and Andrew T. Robinson,
//* All Rights Reserved
//*****************************************************************************
class StormSCEP extends StormIapProcess 
{
	constructor ( element , prefix , choiceGenerator = function () { return arguments; } ) 
	{
		if ((prefix === undefined) || (prefix === null))
		{
			prefix = "";
		}
		
		var name = "SCEP";
				
		var factors = 
		[
			new StormIapFactorSelector({
				name: "Mitigates" ,
				controlElement: $("#" + StormUtility.camel(prefix, "mitigates", "selector")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "mitigates", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choiceGenerator: choiceGenerator ,
				choices: null
			}) ,
			new StormIapFactorSelector({
				name: "Control Type" ,
				controlElement: $("#" + StormUtility.camel(prefix, "control", "type", "selector")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "control", "type", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ label: "Accept Risk" ,  value: "Accept Risk" } ),
					new StormIapChoice({ label: "Apply External Control" , value: "Apply External Control" } ),
					new StormIapChoice({ label: "Patch or Upgrade" , value: "Patch or Upgrade" } ),
					new StormIapChoice({ label: "Fix Configuration" , value: "Fix Configuration" } ),
					new StormIapChoice({ label: "Reduce Confidence" , value: "Reduce Confidence" } ),
				])
			}) ,
			new StormIapFactorSlider({
				name: "Implemented" ,
				controlElement: $("#" + StormUtility.camel(prefix, "implemented", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "implemented", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("red") , value: 0.0000 , label: "0%" }),
					new StormIapChoice({ color: StormUtility.standardColor("orange") , value: 0.2500 , label: "25%" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , value: 0.5000 , label: "50%" }),
					new StormIapChoice({ color: StormUtility.standardColor("blue") , value: 0.7500 , label: "75%" }),
					new StormIapChoice({ color: StormUtility.standardColor("green") , value: 1.0000 , label: "100%" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Correction" ,
				controlElement: $("#" + StormUtility.camel(prefix, "correction", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "correction", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("red") , value: 0.0000 , label: "0%" }),
					new StormIapChoice({ color: StormUtility.standardColor("orange") , value: 0.2500 , label: "25%" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , value: 0.5000 , label: "50%" }),
					new StormIapChoice({ color: StormUtility.standardColor("blue") , value: 0.7500 , label: "75%" }),
					new StormIapChoice({ color: StormUtility.standardColor("green") , value: 1.0000 , label: "100%" })
				])
			}) 
		];

		super({ element: element , name: name , factors: factors });
		
		this.mitigatesFactor = this.factors[0];
		this.controlTypeFactor = this.factors[1];
		this.correctionFactor = this.factors[2];
		this.implementedFactor = this.factors[3];
	}
	
	// Effective remedial level
	get effectiveRemediation ( )
	{
		var correction = this.correctionFactor.value();
		var implemented = this.implementedFactor.value();
		
		return correction * implemented;
	}
	
	// Maximum remedial level
	get maximumRemediation ( )
	{
		return this.correctionFactor.value();
	}
	
	// Set the range of a slider 
	setRange ( )
	{
		console.log("StormSCEP/setRange call does nothing");
	}
	
	// Reset object
	reset ()
	{
		super.reset();
		
		return this;
	}
			
	// Compute the values of the process
	compute ( )
	{
		var answer = this.effectiveRemediation;
		
		return answer;
	}
	
	// Return process and factors - CANNOT BE CHAINED
	descriptor ( explicit = {} )
	{
		var answer = super.descriptor( explicit );
		
		answer.mitigates = this.mitigatesFactor.scrape().value();
		answer.controlType = this.controlTypeFactor.scrape().value();
		answer.correction = this.correctionFactor.scrape().value();
		answer.implemented = this.implementedFactor.scrape().value();
		answer.effective = this.effectiveRemediation;
		answer.maximum = this.maximumRemediation;
				
		delete answer.value;
		
		return answer;
	}
		
	// Update UI display
	update ()
	{
		var self = (this instanceof StormIapProcess) ? this : StormIapProcess.getContext(this);
		
		self.compute();
		
		return self;
	}
}
