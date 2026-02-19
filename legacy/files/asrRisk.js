//jshint esnext:true
/*global StormIapProcess 	*/
/*global StormIapInterface*/
/*global StormUtility 		*/
/*global StormIapProcess 	*/
/*global StormIapFactorSlider 	*/
/*global StormIapChoiceMap	*/
/*global StormIapChoice		*/
/*global StormHAM533		*/
/*global StormCRVE3			*/
/*global Interactions		*/
/*global StormIapTableColumn */
/*global StormIapTableView 	*/
/*global StormIapTableAggregation */
/*global StormIapTableRowTemplate */
/*global StormIapTable 		*/
/*global StormIapModelMap	*/
/*global StormIapModel 		*/
/*global StormIapModelTemplate */
/*global StormIapFactorCheckbox	*/
/*global StormSCEP	*/
/*global StormCalculator */
/*exported generatePairing 	*/
/*exported pageLocal		*/

"use strict";
//*****************************************************************************
//* 
//*****************************************************************************
class AsrValuation extends StormIapProcess
{
	//-------------------------------------------------------------------------
	//
	//-------------------------------------------------------------------------
	constructor ( element = null , readyElement = null , prefix = null ) 
	{
		if (!prefix)
		{
			prefix = "";
		}
		
		var name = "ASRAV";
		var prototype = AsrValuation.prototype;
				
		var factors = 
		[
			new StormIapFactorSlider({
				name: "Data Classification" ,
				controlElement: $("#" + StormUtility.camel(prefix, "class", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "class", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ action: prototype.lockHv , color: StormUtility.standardColor("green") , label: "Public" }),
					new StormIapChoice({ action: prototype.unlockHv , color: StormUtility.standardColor("yellow") , label: "Confidential: NDA" }),
					new StormIapChoice({ action: prototype.unlockHv , color: StormUtility.standardColor("red") , label: "Confidential: Restricted" })
				])
			}) ,
			new StormIapFactorSlider({
				name: "Users" ,
				controlElement: $("#" + StormUtility.camel(prefix, "users", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "users", "value")) ,
				processElement: $(element) ,
				group: "basic" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ color: StormUtility.standardColor("green") , label: "1-10" }),
					new StormIapChoice({ color: StormUtility.standardColor("blue") , label: "11-100" }),
					new StormIapChoice({ color: StormUtility.standardColor("yellow") , label: "101-500" }),
					new StormIapChoice({ color: StormUtility.standardColor("orange") , label: "501+" }),
					new StormIapChoice({ color: StormUtility.standardColor("red") , label: "Non-Akamai Users" })
				])
			}) ,
			new StormIapFactorCheckbox({
				name: "High Value Data" ,
				controlElement: $("#" + StormUtility.camel(prefix, "high", "value", "slider")) ,
				valueElement: $("#" + StormUtility.camel(prefix, "high", "value", "value")) ,
				processElement: $(element) ,
				group: "hv" ,
				choices: new StormIapChoiceMap(
				[
					new StormIapChoice({ action: prototype.clearHv , color: StormUtility.standardColor("green") , value: 1 , label: "None" }),
					new StormIapChoice({ action: prototype.clearNone , color: StormUtility.standardColor("blue") , value: 3 , label: "Business" }),
					new StormIapChoice({ action: prototype.clearNone , color: StormUtility.standardColor("cyan") , value: 4 , label: "IT" }),
					new StormIapChoice({ action: prototype.clearNone , color: StormUtility.standardColor("yellow") , value: 6 , label: "Legal" }),
					new StormIapChoice({ action: prototype.clearNone , color: StormUtility.standardColor("orange") , value: 7 , label: "Finance" }),
					new StormIapChoice({ action: prototype.clearNone , color: StormUtility.standardColor("red") , value: 8 , label: "HR" })
				], StormIapFactorCheckbox.prototype.maximum)
			}) ,
		];

		super({ element: element , name: name , factors: factors });

		this.readyElement = readyElement ? $(readyElement) : null;
		this.valueElement = $("#" + StormUtility.camel(prefix, "asset", "value"));
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
			}
			else
			{
				target = (answer === "none") ? "inline-block" : "none";
			}
				
			this.readyElement.css("display", target).trigger("change");
		}
		
		return answer;
	}
	
	// Reset to original state
	reset ( )
	{
		super.reset();
		
		this.ready("none");
	}
	
	// Spread values into the data entry interface
	spread ( row = [] )
	{
		var changes = 0;
		
		if (row[0] instanceof Array)
		{
			this.spread(row[0]);
		}
		else
		{
			var map = 
			[ 
				{ object: this.factors[0] , descriptor : value => { return { position : value }; }, setter: this.factors[0].spread } , 
				{ object: this.factors[1] , descriptor : value => { return { position : value }; }, setter: this.factors[1].spread } ,
				{ object: null , descriptor: null , setter: null } ,
				{ object: this.factors[2] , descriptor : value => { return { checkboxes: value }; }, setter: this.factors[2].spread }
			];
			
			for (var index in row)
			{
				var mapping = map[index];
				
				if (mapping.object !== null)
				{
					var value = row[index];
					var descriptor = mapping.descriptor(value);
					
					mapping.setter.call(mapping.object, descriptor);
					mapping.object.scrape();
					
					changes++;
				}
			}
		}
		
		if (changes > 0)
		{
			this.ready("inline-block");
		}
		
		return this;
	}
	
	// Scrape values from the data entry interface
	scrape ( )
	{
		var row = 
		[
			asset.factors[0].value() ,
			asset.factors[1].value() ,
			asset.factors[2].value() ,
			asset.factors[2].descriptor.checkboxes
		];
		
		return [ row ];
	}
	
	// Lock the HV controls
	lockHv ( cache , choice , value ) // jshint unused:false
	{
		this.controlElement.find("input[type=checkbox]").prop("checked", false).prop("disabled", true);
	}
	
	// Unlock the HV controls
	unlockHv ( cache , choice , value ) // jshint unused:false
	{
		this.controlElement.find("input[type=checkbox]").prop("checked", false).prop("disabled", false);
	}
	
	// Clear HV when "none" is selected
	clearHv ( cache , choice , value ) // jshint unused:false
	{
		if (cache.is(":checked"))
		{	
			this.controlElement.find("input[type=checkbox][value!=1]").prop("checked", false);
		}
	}
	
	// Clear "None" when other HV groups are selected
	clearNone ( cache , choice , value ) // jshint unused:false
	{
		if (cache.is(":checked"))
		{
			this.controlElement.find("input[type=checkbox][value=1]").prop("checked", false);
		}
	}
	
	//-------------------------------------------------------------------------
	//
	//-------------------------------------------------------------------------
	update ()
	{
		var self = (this instanceof StormIapProcess) ? this : StormIapProcess.getContext(this);
		
		self.compute();
		
		var value = StormUtility.precisify(self._value, 4, false);
		
		self.valueElement.text(value);
		
		return self;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrThreatInterface extends StormIapInterface
{
	constructor ( )
	{
		var typeDescriptor =
		{
			type: "threat" ,
			nameElement: $("#threatName") ,
			tableObject: threats ,
			processObject: threat ,
			readyElement : $("#tc") ,
			rowGenerator : function ( descriptor )
			{
				var answer =
				[
					descriptor.description ,
					descriptor.template ,
					descriptor.factors.history ,
					descriptor.factors.access , 
					descriptor.factors.means , 
					descriptor.probability,
					descriptor.impact
				];
				
				return answer;
			} ,
			postProcessor: function ( /* descriptor */ ) 
			{
				risks.materialize();
			}
		};
		
		super(typeDescriptor);
	}

	// Check if something is a template, and change if necessary
	// THIS DOESN'T ACTUALLY DO ANYTHING - scrape of CRUD leaves template = false
	_checkTemplate ( row , descriptor , options ) // jshint unused:false 
	{	
		var rowCopy = row.slice(0);
		var answer = Object.assign({ row : rowCopy , inquiry : null }, options); 
		
		if ((rowCopy[1] === true) && options.askUpdate)
		{
			rowCopy[1] = false;
			
			answer.inquiry = "This threat comes from a template--updating it will create a local copy.";
			answer.askUpdate = false;
			answer.allowUpdate = true;		
		}
		
		return answer;
	}
	
	// Customized add or update
	addOrUpdateRow ( row , options )
	{
		return super.addOrUpdateRow(row, options, this._checkTemplate);
	}
	
	// Perforn a reset
	reset ()
	{	
		super.reset();
		
		this.nameElement.val(null);
		this.processObject.reset();
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrVulnerabilityInterface extends StormIapInterface
{
	constructor ()
	{
		var columnList =
		[
			"description" ,
			"template" ,
			"capabilities" ,
			"resources" ,
			"visibility" ,
			"confidentialityExposure" ,
			"integrityExposure" ,
			"availabilityExposure" ,
			"ciaValue" ,
			"exposure"
		];

		var typeDescriptor = 
		{
			type: "vulnerability" ,
			nameElement: $("#vulnerabilityName") ,
			tableObject : vulnerabilities ,
			processObject: vulnerability ,
			readyElement : $("#vc") ,
			rowGenerator: function ( descriptor )
			{
				var answer =
				[
					descriptor.description ,
					descriptor.template ,
					descriptor.factors.capabilities ,
					descriptor.factors.resources , 
					descriptor.factors.visibility , 
					descriptor.factors.confidentialityExposure ,
					descriptor.factors.integrityExposure ,
					descriptor.factors.availabilityExposure ,
					descriptor.ciaValue ,
					descriptor.exposure 
				];
				
				return answer;				
			} ,
			postProcessor: function ( /* descriptor */ ) { console.log(this.constructor.name + "/constructor postProcessor does nothing"); }
		};
	
		super(typeDescriptor);
		
		this._length = columnList.length;
		
		// Add inherent risk
		this.inherent();
	}

	// Check if something is a template, and change if necessary
	// THIS DOESN'T ACTUALLY DO ANYTHING - scrape of CRUD leaves template = false
	_checkTemplate ( row , descriptor , options ) // jshint unused:false
	{	
		var rowCopy = row.slice(0);
		var answer = Object.assign({ row : rowCopy , inquiry : null }, options); 
		
		if ((rowCopy[1] === true) && options.askUpdate)
		{
			rowCopy[1] = false;
			
			answer.inquiry = "This vulnerability comes from a template--updating it will create a local copy.";
			answer.askUpdate = false;
			answer.allowUpdate = true;		
		}
		
		return answer;
	}
	
	// Customized add or update
	addOrUpdateRow ( row , options )
	{
		return super.addOrUpdateRow(row, options, this._checkTemplate);
	}
	
	// Perforn a reset
	reset ()
	{	
		super.reset();
		
		this.inherent();
		this.nameElement.val(null);
		this.processObject.reset();
	}
	
	// Updates require the addition of the inherent vulnerability if it isn't there
	update ()
	{
		super.update();
		
		this.inherent();
	}
	
	// Length in number of columns 
	length ()
	{
		return this._length;
	}
	
	// Add an inherent vulnerability to all models
	inherent ()
	{
		var inherent =
		{
			capabilities : 2 , 
			resources : 2 , 
			visibility : 2 , 
			confidentialityExposure : 2 , 
			integrityExposure : 2 , 
			availabilityExposure : 2
		};
		
		this.nameElement.val("Inherent Vulnerability");
		this.processObject.set(inherent).compute();
		
		var row = this.scrape().row;

		this.addOrUpdateRow(row, {allowUpdate: false, askUpdate: false, ignoreUpdate: true, nameColumn: 0});
		this.processObject.reset();	
		this.nameElement.val(null);
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrControlInterface extends StormIapInterface
{
	constructor ( )
	{
		var columnList =
		[
			"description" ,
			"template" ,
			"vulnerabilities" ,
			"type" ,
			"implemented" ,
			"mitigation" ,
			"effective"
		];

		var typeDescriptor = 
		{
			type: "control" ,
			nameElement: $("#controlName") ,
			tableObject : controls ,
			processObject: control ,
			readyElement : $("#cc") ,
			rowGenerator: function ( descriptor )
			{
				var answer =
				[
					descriptor.description ,
					descriptor.template ,
					descriptor.mitigates ,
					descriptor.controlType , 
					descriptor.implemented ,
					descriptor.correction ,
					descriptor.effective
				];
				
				return answer;				
			} ,
			postProcessor: function ( /* descriptor */ ) { console.log(this.constructor.name + "/constructor postProcessor does nothing"); }
		};
	
		super(typeDescriptor);
		
		this._length = columnList.length;
	}

	// Check if something is a template, and change if necessary
	// THIS DOESN'T ACTUALLY DO ANYTHING - scrape of CRUD leaves template = false
	_checkTemplate ( row , descriptor , options ) // jshint unused:false
	{	
		var rowCopy = row.slice(0);
		var answer = Object.assign({ row : rowCopy , inquiry : null }, options); 
		
		if ((rowCopy[1] === true) && options.askUpdate)
		{
			rowCopy[1] = false;
			
			answer.inquiry = "This control comes from a template--updating it will create a local copy.";
			answer.askUpdate = false;
			answer.allowUpdate = true;		
		}
		
		return answer;
	}
	
	// Customized add or update
	addOrUpdateRow ( row , options )
	{
		return super.addOrUpdateRow(row, options, this._checkTemplate);
	}
	
	// Perforn a reset
	reset ()
	{	
		super.reset();
		
		this.nameElement.val(null);
		this.processObject.reset();
	}
	
	// Updates require the addition of the inherent vulnerability if it isn't there
	update ()
	{
		super.update();
	}
	
	// Length in number of columns 
	length ()
	{
		return this._length;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrRiskTableRowThreatAggregated extends StormIapTableRowTemplate
{
	constructor ()
	{
		var numeric = { width : "8em" , className : "textRight" , render: renderNumeric };
		var columns =
		[
			new StormIapTableColumn( "vulnerability" , 0 ) , 
			new StormIapTableColumn( "exposure" , 1 , numeric ) , 
			new StormIapTableColumn( "value", 2 , numeric ) ,
			new StormIapTableColumn( "probability" , 3 , numeric ) , 
			new StormIapTableColumn( "impact" , 4 , numeric ) , 
			new StormIapTableColumn( "controls" , 5  ) , 
			new StormIapTableColumn( "efficacy" , 6 , numeric ) , 
			new StormIapTableColumn( "distributed" , 7 , numeric ) , 
			new StormIapTableColumn( "single" , 8 , numeric ) , 
		];
		
		super(columns);
		
		this.generator = null;
	}
	
	// Generate risks for threat AGGREGATED risk
	generate ( assets = null , threats = null , vulnerabilities = null , controls = null , silent = true )
	{
		var value = assets.compute().value();
		var self = this;
		var missing = 
			isNaN(value) || 
			(vulnerabilities.view.dataTable.rows().count() <= 0) ||
			(threats.view.dataTable.rows().count() <= 0);
		var rows = [];
		
		if (missing)
		{
			if (silent)
			{
				console.log("AsrRiskTableRowThreatAggregated/generateRisks missing components");
			}
			else
			{
				alert("Missing asset valuation, threat list, or vulnerability list");
			}
		}
		else
		{
			var { probability , impact } = threats.view.getAggregates();
			var rowTemplate = vulnerabilities.view.rowTemplate;
			
			vulnerabilities.view.dataTable.rows().every(function () 
			{
				var vulnerability = this.data();
				var name = rowTemplate.get("name", vulnerability);
				var control = controls.findControls(name);
				var controlList = control.names.length !== 0 ? control.names.join(", ") : null;
				var efficacy = control.efficacy;
				var exposure = parseFloat(rowTemplate.get("exposure", vulnerability));
				var distributed = value * probability * exposure * (1 - efficacy);
				var single = value * impact * exposure * (1 - efficacy);
				
				var row = self.ingest([
					name ,
					value  ,
					exposure  ,
					probability  ,
					impact  ,
					controlList ,
					efficacy , 
					distributed  ,
					single 
				]);
				
				rows.push(row);
			});
		}
		
		return rows;
	}
}


//*****************************************************************************
//* 
//*****************************************************************************
class AsrControlsTable extends StormIapTable
{
	// Build it
	contructor ( element = { table : null , button : null } )
	{
		super(
			new StormIapTableView({
				name: "controls" , 
				element: element.table ,
				rowTemplate: new AsrControlTableRow() ,
				aggregate: new StormIapTableAggregation([ 6 ], "EFFICACY" , {order: [[6, "desc"], [5, "desc"]]})
			}) ,
			"controls" ,
			[ element.table , element.button ]
		);
	}
	
	// Find all the controls applicable to a vulnerability
	findControls ( vulnerability = null )
	{
		var answer = { names : [] , rows : [] , efficacy : 0.0000 };
		var seen = {};
		var rows = this.view.getRowData(false);
		var calculator = new StormCalculator({ selector : 6 });
		
		for (var row of rows)
		{
			var index = row.mitigates.indexOf(vulnerability);
			
			if (index >= 0)
			{
				answer.rows.push(row);
				calculator.add(row);
				
				if (!seen[vulnerability])
				{
					answer.names.push(vulnerability);
					seen[vulnerability] = true;
				}
			}
		}
		
		if (answer.names.length > 0)
		{
			answer.efficacy = calculator.aggregate().result;
		}
		
		return answer;
	}
	
	
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrRiskTable extends StormIapTable
{
	// Build a result table with two views
	constructor ( element = { table : null , button : null } , pairGenerator = {} , components = { assets : null , threats : null , vulnerabilities : null , controls : null } )
	{		
		// View definitions
		var views =
		[
			new StormIapTableView({
				name: "tar" ,
				element: element.table , 
				htmlTemplate: $("#riskTar") ,
				rowTemplate: new AsrRiskTableRowThreatAggregated() ,
				aggregate: new StormIapTableAggregation([ 5 , 6 ], "RESIDUAL RISK", {order: [[5, "desc"], [6, "desc"]]})
			})
		];
		
		// Create "this" as superclass
		super(views, "tar", [ element.table  , element.button ]);
		
		// New properties of subclass
		this.pairGenerator = pairGenerator;
		this.assets = components.assets;
		this.threats = components.threats;
		this.vulnerabilities = components.vulnerabilities;
	}
	
	// Generate risks (if any) to fill the table
	generate ( )
	{
		var self = StormIapTable.getContext(this);
		var view = self.getViewObject();
		var rowTemplate = view.rowTemplate;
		
		// Generate rows to display
		var rows = rowTemplate.generate(self.assets , self.threats , self.vulnerabilities);
		
		// Insert the rows into the table and display 
		view.dataTable.clear();
		view.spread(rows);
		
		return self;
	}
	
	// Switch the result table view
	switchView ( mode = "tar" )
	{
		// Perform the mode switch
		super.switchView(mode);		
		
		return this;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrThreatTableRow extends StormIapTableRowTemplate
{
	constructor ()
	{
		var numeric = { width : "5em" , className : "textRight" , render: renderNumeric };
		var columns =
		[
			new StormIapTableColumn( "name" , 0 ) , 
			new StormIapTableColumn( "template" , 1 , { width : "5em" } ) , 
			new StormIapTableColumn( "history" , 2 , numeric ) , 
			new StormIapTableColumn( "access" , 3 , numeric ) , 
			new StormIapTableColumn( "means" , 4 , numeric ) , 
			new StormIapTableColumn( "probability" , 5 , numeric ) , 
			new StormIapTableColumn( "impact" , 6 , numeric ) , 
		];
		
		super(columns);
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrVulnerabilityTableRow extends StormIapTableRowTemplate
{
	constructor ()
	{
		var numeric = { width : "5em" , className : "textRight" , render: renderNumeric };
		var columns =
		[
			new StormIapTableColumn( "name" , 0 ) , 
			new StormIapTableColumn( "template" , 1 , { width : "5em" } ) , 
			new StormIapTableColumn( "capabilities" , 2 , numeric ) , 
			new StormIapTableColumn( "resources" , 3 , numeric ) , 
			new StormIapTableColumn( "visibility" , 4 , numeric ) , 
			new StormIapTableColumn( "confidentialityExposure" , 5 , { visible : false } ) , 
			new StormIapTableColumn( "integrityExposure" , 6 , { visible : false } ) , 
			new StormIapTableColumn( "availabilityExposure" , 7 , { visible : false } ) , 
			new StormIapTableColumn( "effects" , 8 , numeric ) , 
			new StormIapTableColumn( "exposure" , 9 , numeric ) , 
		];
		
		super(columns);
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AsrControlTableRow extends StormIapTableRowTemplate
{
	constructor ()
	{
		var numeric = { width : "5em" , className : "textRight" , render: renderNumeric };
		var columns =
		[
			new StormIapTableColumn( "name" , 0 ) , 
			new StormIapTableColumn( "template" , 1 , { width : "5em" } ) , 
			new StormIapTableColumn( "mitigates" , 2 ) , 
			new StormIapTableColumn( "controlType" , 3 ) , 
			new StormIapTableColumn( "implemented" , 4 , numeric ) ,
			new StormIapTableColumn( "correction" , 5 , numeric ) ,
			new StormIapTableColumn( "effective" , 6 , numeric )
		];
		
		super(columns);
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
class AuthorizationObject 
{
	// Constructor 
	constructor ( identity = {} )
	{
		this.set(identity);
		
		this.setContext();
	}
	
	// Set context 
	setContext ( )
	{
		$(document).data("AuthorizationObject", this);
	}
	
	// Get context
	static getContext ( )
	{
		var answer = $(document).data("AuthorizationObject");
		
		return answer;
	}
	
	// Set an identity
	set ( identity = {} )
	{
		if ("identity" in identity)
		{
			this.identity = identity.identity;
		}
		else
		{
			this.identity = identity;
		}
	}
	
	// Check identity (can be invoked as class method, jQuery action, etc.)
	check ( identity = null , silent = false )
	{
		var answer, self; 
		
		// Find out who we are
		if (this instanceof AuthorizationObject)
		{
			self = this;
		}
		else
		{
			self = AuthorizationObject.getContext();
		}
		
		// If there is an identity provided, set it
		if (identity !== null)
		{
			self.set(identity);
		}
		
		// Now check the status;
		if (!self.identity.failed)
		{
			answer = true;
		}
		else
		{
			console.log("Authority/check authentication failure", self);
			
			if (!silent)
			{
				alert("Authentication failure for [" + this.identity.user + "] with role [" + this.identity.role + "]");
			}
			
			answer = false;
		}
		
		return answer;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************

var CHANGES = 0;
var TIMER = null;
var MODELS = new StormIapModelMap();
var APPLICATIONS = [];
var applications = null;
var templates = null;
var IDENTITY = new AuthorizationObject();
var _LOW_APPETITE = 0.0125;
var _MEDIUM_APPETITE = 0.0250;
var AUTO = { threats: {} , vulnerabilities: {} };
/** VTP SHELVED - BUILD 873 
var PAIRINGS = 0;
**/
var interactions = null;
var threats = null;
var vulnerabilities = null;
var controls = null;
var risks = null;
var asset = null;
var threat = null;
var vulnerability = null;
var control = null;
var threatInterface = null;
var vulnerabilityInterface = null;
var controlInterface = null;

//*****************************************************************************
//* 
//*****************************************************************************
/* jshint shadow:true */
var qualify = function ( element , invert = false )
{
	var cache = $(element);
	var risk = cache.text();
	var colors = 
	{
		false : 
		{
			low : { background : "#0f0" , color : "black" } ,
			medium : { background : "#ff0" , color : "black" } ,
			high : { background : "#f00" , color : "black" } 
		} , 
		true : 
		{ 
			low : { background : "black" , color : "#0f0" } ,
			medium : { background : "black" , color : "#ff0" } ,
			high : { background : "black" , color : "#f00" }
		}
	};
	
	if (risk <= _LOW_APPETITE)
	{
		var { background , color } = colors[invert].low;		
		cache.css("background-color", background).css("color", color).data("level", "low");
	}
	else if (risk <= _MEDIUM_APPETITE)
	{
		var { background , color } = colors[invert].medium; 
		cache.css("background-color", background).css("color", color).data("level", "medium");
	}
	else 
	{
		var { background , color } = colors[invert].high; 
		cache.css("background-color", background).css("color" , color).data("level", "high");
	}
	
	cache.css("font-weight", "bold").css("text-align", "right");
	
	return cache;
};

//*****************************************************************************
//* 
//*****************************************************************************
var loadInterface = function ( model , clear = true )
{
	if (!(model instanceof StormIapModel))
	{
		alert("Model '" + model.name + "' is not a StormIapModel");
	}
	else
	{
		asset.reset();
		threat.reset();
		threats.view.dataTable.clear();
		threatInterface.reset();
		vulnerability.reset();
		vulnerabilities.view.dataTable.clear();
		vulnerabilityInterface.reset();
		control.reset();
		controls.view.dataTable.clear();
		controlInterface.reset();
		
		model.spread(
			{ 
				assets : asset , 
				threats : threatInterface , 
				vulnerabilities : vulnerabilityInterface , 
				controls : controlInterface 
			}, 
			{
				allowUpdate: true ,
				askUpdate: false ,
				clear : clear
			}
		);
		
		risks.generate();
	}
};

//*****************************************************************************
//* 
//*****************************************************************************
var deleteModel = function (  )
{
	var name = $("#modelName").val();
	var answer = null;
	
	if (!name)
	{
		alert("You must specify a model to delete");
	}
	else if (!MODELS.exists(name))
	{
		throw new ReferenceError("asrRisk/deleteModel model " + name + " doesn't exist (this should be impossible");
	}
	else if (confirm("Do you really wish to delete model " + name + "?"))
	{
		// Get the model
		var model = MODELS.getModel(name);
		
		// Update the model
		model.scrape({ assets : asset , threats : threats.view , vulnerabilities: vulnerabilities.view , controls: controls.view , risks: risks.view});
		
		// Delete it
		MODELS.hide({ updates: model , postProcessor: function ( oldModel ) {
			this.removeModel(oldModel.name);
			
			modelsLoaded.call(this);
		}});
	}
	
	return answer;
};

//*****************************************************************************
//* 
//*****************************************************************************
var saveModel = function ( autosave = false )
{
	var name = $("#modelName").text();
	
	if (!name)
	{
		alert("saveModel entered with a model name--this should be impossible");
	}
	else 
	{
		var exists = MODELS.exists(name);
		var model = exists ? MODELS.getModel(name) : new StormIapModel({ name: name });
			
		// Update the model with CRUD contents
		model.scrape({ assets: asset , threats: threats.view , vulnerabilities: vulnerabilities.view , controls: controls.view , risks: risks.view });
			
		// Save it
		MODELS.save({ updates: model , autosave : autosave  , postProcessor : function ( newModel ) 
		{
				if (!exists)
				{
					this.addModel(newModel.name, newModel);
					
					modelsLoaded.call(this);
				}
				
				if (!autosave || (autosave instanceof jQuery.Event))
				{
					var when = new Date().toISOString();
					$("#autosave").text("Manually saved on " + when);
				}
		}});
	}
};

//*****************************************************************************
//* "this" is a StormIapModelMap
//*****************************************************************************
var modelLoader = function ( success , failure , updates = null , autosave = false )
{
	var request = {};
	
	if (updates)
	{
		request.action = "update";
		request.updates = JSON.stringify(updates); 
		request.autosave = autosave;
	}
	
	$.ajax({
		method: "post" ,
		url: "asrRisk.cgi" ,
		data: request ,
		timeout: 80000 ,
		success: success ,
		error : failure 
	});	
	
	return modelsLoaded;
};

//*****************************************************************************
//* "this" is a StormIapModelMap
//*****************************************************************************
var modelsLoaded = function ( results ) // jshint unused:false
{
	this.autocomplete("#modelName");
	this.autocomplete("#threatName", selectedAutoComplete, "threat");
	this.autocomplete("#vulnerabilityName", selectedAutoComplete, "vulnerability");
	this.autocomplete("#controlName", selectedAutoComplete, "control");
};

//*****************************************************************************
//* 
//*****************************************************************************
function getAutoCompleteData ( type , value )
{
	var answer = null;
	
	if ((type in AUTO) && (value in AUTO[type]))
	{
		answer = AUTO[type][value];	
	}
	
	return answer;
}

//*****************************************************************************
//* 
//*****************************************************************************
var selectedAutoComplete = function ( thrown , ui )
{
	var type = $(this).closest("table.tabRow").find(".fubar").attr("id");
	var value = ui.item.label;
	var row = getAutoCompleteData(type, value);
	
	if ((row !== null) && (row !== undefined))
	{
		loadProcess(type, row);
	}
};

//*****************************************************************************
//* 
//*****************************************************************************
function addThreat () 
{
	// { nameColumn : 0, ignoreUpdate : false, allowUpdate: true, askUpdate: false }
	if (!threatInterface.scrape().addOrUpdateRow(null, { askUpdate : true }))
	{
		console.log("asrRisk/addThreat Failed to add threat");
	}
	else
	{
		$("#threatName").val(null);
		threat.reset();
		
		risks.generate();
		
		CHANGES++;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
function addVulnerability ( ) 
{
	if (!vulnerabilityInterface.scrape().addOrUpdateRow(null, { askUpdate : true }))
	{
		console.log("addRisk/addVulnerability Failed to add vulnerability");
	}
	else
	{
		$("#vulnerabilityName").val(null);
		vulnerability.reset();
		
		risks.generate();
		
		CHANGES++;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
function choicesFromVulnerabilities ( ) 
{
	var rows = vulnerabilities ? vulnerabilities.view.getRowData() : [];
	var answer = new StormIapChoiceMap([new StormIapChoice({ value: null , label: "[select a vulnerability]" })]);
	
	for (var row of rows)
	{
		var name = row.get("name");
		var choice = new StormIapChoice({ label : name , value : name });
		
		answer.add(choice);
	}
	
	return answer;
}

//*****************************************************************************
//* 
//*****************************************************************************
function addControl ( ) 
{
	if (!controlInterface.scrape().addOrUpdateRow(null, { askUpdate : true }))
	{
		console.log("asrRisk/addControl failed to add control");
	}
	else
	{
		$("#controlName").val(null);
		control.reset();
		
		risks.generate();
		
		CHANGES++;
	}
}

//*****************************************************************************
//* 
//*****************************************************************************
var loadProcess = function ( )
{
	// Get the interface and datatable object for row on which we clicked
	var face = StormIapInterface.getContext(this);
	var dataTable = face.tableObject.view.dataTable;
	
	// Get the row from the table
	var row = dataTable.row(this).data();
	
	// If successfull so far, update the process UI
	face.spreadUi(row);
};

//*****************************************************************************
//* 
//*****************************************************************************
var setRiskModel = function ( /** VTP SHELVED - BUILD 873 candidate = "tar" **/ )
{
	/** VTP SHELVED - BUILD 873
	var check = $("#threatAggregated");
	var model;
	
	if (candidate instanceof jQuery.Event)
	{
		if (check.is(":checked"))
		{
			model = "tar";
		}
		else
		{
			model = "vtp";	
		}
	}
	else if (typeof candidate === "string")
	{
		if (candidate === "tar")
		{
			check.prop("checked", true);
			model = "tar";
		}
		else if (candidate === "vtp")
		{
			check.prop("checked", false);
			model = "vtp";
		}
		else if (typeof candidate === "string")
		{
			throw new Error("setRiskModel invalid model " + candidate);
		}
	}
	else
	{
		throw new Error("setRiskModel first parameter not recognized");
	}
	
	setupRiskTable(model);
	**/ setupRiskTable("tar");
};

//*****************************************************************************
//* 
//*****************************************************************************
var enableRisks = function ()
{
	/** VTP SHELVED - BUILD 873 
	var pairMap = (getRiskModel() === "vtp") ? 
		{ "ac" : true , "tc" : true , "vc" : true , "vtc" : true } :
		{ "ac" : true , "tc" : true , "vc" : true };
	**/
	
	var pairMap = 
	{	
		"ac" : true ,
		"tc" : true ,
		"vc" : true ,
		"cc" : true
	};
	
	$(".completed").each(function ()
	{
		var status = $(this).css("display");
		var id = this.id;
		
		if ((id in pairMap) && (status === "none"))
		{
			pairMap[id] = false;
		}
	});
	
	var disable = Object.values(pairMap).indexOf(false) > 0;
	
	$("#risks").prop("disabled", disable).button("option", "disabled", disable);
	$("#reporter").prop("disabled", disable).button("option", "disabled", disable);

};

//*****************************************************************************
//* 
//*****************************************************************************
var enableUi = function ( force )
{
	var target = (typeof force === "boolean") ? force : $("#modelName").text() !== ""; 
	
	$("#save, #reset").prop("disabled", target).button("option", "disabled", !target);
	$("#steps").tabs((target ? "enable" : "disable"), "#assetTab");
	$("#steps").tabs((target ? "enable" : "disable"), "#threatTab");
	$("#steps").tabs((target ? "enable" : "disable"), "#vulnerabilityTab");
	$("#steps").tabs((target ? "enable" : "disable"), "#controlTab");
};

//*****************************************************************************
//* 
//*****************************************************************************
function setupThreatTable ( )
{
	threats = new StormIapTable(
		new StormIapTableView({
			element: "#threats" , 
			rowTemplate: new AsrThreatTableRow() , 
			aggregate: new StormIapTableAggregation(
				[ 5 , 6 ] ,
				"AGGREGATE" ,
				{ order : [ [ 5 , "desc" ] , [ 6 , "desc" ] ] }
			)
		}),
		null ,
		[ $("#threats") ]
	);
	
	threats.materialize();
}

//*****************************************************************************
//* 
//*****************************************************************************
function setupVulnerabilityTable ( )
{
	vulnerabilities = new StormIapTable(
		new StormIapTableView({
			element: "#vulnerabilities" ,
			rowTemplate: new AsrVulnerabilityTableRow() ,
			aggregate: new StormIapTableAggregation(
				[ 9 ] ,
				"AGGREGATE" ,
				{ order : [ [ 9 , "desc" ] ] }
			)
		}),
		null,
		[ $("#vulnerabilities") ]
	);
	
	vulnerabilities.materialize();
}

//*****************************************************************************
//* 
//*****************************************************************************
function setupControlTable ( )
{
	controls = new AsrControlsTable( { table : "#controls" , button : null } );
	
	controls.materialize();
}

//*****************************************************************************
//* 
//*****************************************************************************
function setupRiskTable ( model = "tar" )
{
	if (!risks)
	{
		var components = { assets : asset , threats : threats , vulnerabilities : vulnerabilities , controls : controls };
		
		risks = new AsrRiskTable({ table: "#riskTable", button: "#risks" }, null, components);
	}
	
	// Set the required view
	risks.switchView(model);
	
	// Generate the risks
	risks.materialize();	
}

//*****************************************************************************
//* 
//*****************************************************************************
var deleteRow = function ( /*thrown*/ )
{
	var counts = 
	{ 
		threats : { count : 0 , table : threats.view.dataTable } ,
		vulnerabilities : { count : 0 , table : vulnerabilities.view.dataTable } ,
		controls : { count : 0 , table : controls.view.dataTable }
	};
	var any = false;
	var rows = $("table.fubar .selected");
	
	rows.each(function () 
	{
		var row = $(this);
		var parentId = row.closest("table.fubar").attr("id");
		
		if (parentId in counts)
		{
			any = true;
			
			counts[parentId].count++;
		}
	});
	
	if (any)
	{
		var message = "The following action will delete\n\n";
		
		for (var [ component , descriptor ] of Object.entries(counts)) // jshint ignore:line
		{
			var { count } = descriptor;
			
			if (count > 0)
			{
				message += "- " + count + " " + component + " definitions\n";
			}
		}
		
		message += "\nDo you wish to continue?";
			
		if (confirm(message))
		{
			rows.each(function ()
			{
				CHANGES++;
				
				var row = $(this);
				var parentId = row.closest("table.fubar").attr("id");
				
				if (parentId in counts)
				{
					var { table } = counts[parentId];
				
					table.row(this).remove().draw();
				}
			});
		}
	}
	
	risks.materialize();
};

//*****************************************************************************
//* 
//*****************************************************************************
var renderNumeric = function ( data /* , type , row , meta */ )
{
	var answer = data;
	
	if (/\./.test(data))
	{
		answer = Number(data).toFixed(4);
	}
	
	return answer;
};

//*****************************************************************************
//* 
//*****************************************************************************
var generateReport = function () 
{
	var content = $("#reportDialogContent");
	
	// Remove any previous report HTML
	content.children().remove();
	
	// Generate risks
	risks.generate();
	
	// Risk assessment data
	var riskView = risks.view;
	var riskAssessment = riskView.dataTable.rows().data();
	var { distributed } = riskView.getAggregates();
	var distributedSpan = qualify($("<span>").html(distributed));
	var distributedLevel = distributedSpan.data("level");
	
	// Insert the report body
	content.append(
		$("<h1>").html("Risk Assessment") , 
		$("<p>").html(
			"<u>The aggregate residual risk for this application is " + distributed + 
			" (" + distributedLevel + " risk)</u>. The following table summarizes" +
			"the residual risks associated with each identified vulnerability."
		),
		$("<table>", { class : "reportRiskTable" }).append(
			$("<thead>").append( 
				$("<tr>").append(
					$("<th>").text("Vulnerability"),
					$("<th>").text("Residual Risk")					
				)
			),
			$("<tbody>", { id: "raReportBody"}) ,
			$("<tfoot>").append(
				$("<tr>").append(
					$("<td>").html("AGGREGATE RESIDUAL RISK"),
					qualify($("<td>", { class : "rrtValue" }).html(distributed), true)
				)
			)
		),
		$("<p>", { style : "font-size: 75%; color: #999;"}).html(
			"<em>Residual Risk</em> is calculated as asset value multiplied by the aggregate " + 
			"threat probability multiplied by the vulnerability exposure."
		)
	);
	
	// Cache the report body jQuery object
	var reportBody = $("#raReportBody");
	
	// Insert rows for each vulnerability
	riskAssessment.each(function ( row )
	{
		var riskName = row[0];
		var dle = StormUtility.precisify(row[5], 4);
		
		var rowMarkup =
			$("<tr>").append(
				$("<td>", { class : "rrtName" }).html(riskName),
				qualify($("<td>", { class : "rrtValue" }).html(dle))
			);
			
		reportBody.append(rowMarkup);
	});

	// Asset valuation data
	var assetValuation = asset.compute().descriptor();
	var assetValue = assetValuation.value.toPrecision(4);
	var dataClass = asset.factors[0].choice().choice.label;
	var extent = asset.factors[1].choice().choice.label;
	var hv = asset.factors[2].choice().choice.label;

	// Supporting information for asset valuation
	content.append(
		$("<h2>").html("Supporting Information - Asset Valuation"), 
		$("<p>").
		append(
			"The asset value of this application <em>relative to other applications</em> is " +
			assetValue + " (on a 0 to 1 scale) based on the following attributes"
		).append(
			$("<ul>").
				append($("<li>").html("Akamai data classification &mdash; " + dataClass)).
				append($("<li>").html("Extent of application usage &mdash; " + extent + " users")).
				append($("<li>").html("High value data consumption & production &mdash; " + hv))
		)
	);
	
	var { probability , impact } = threats.view.getAggregates();
	
	// Supporting information for threat assessment 
	content.append(
		$("<h2>").html("Supporting Information - Threat Assessment"),
		$("<p>").html(
			"The threat probability for this application is " + probability + 
			" and the threat impact for this application is " + impact +
			" (on a scale of 0 to 1), based on the following threats:"
		)
	);
	
	// Threat assessment data
	var threatAssessment = threats.view.dataTable.rows().data();
	var threatContent = $("<ul>");

	// Add a list item for every identified threat
	threatAssessment.each(function ( row )
	{
		var threatName = row[0];
		
		threatContent.append($("<li>").html(threatName));
	});
	
	// Add threat content to body
	content.append(threatContent);
	
	// Open the report dialog
	$("#reportDialog").dialog("open");
};

//*****************************************************************************
//* 
//*****************************************************************************
var setAssetValue = function ()
{
	// Trigger our check-mark
	$("#ac").css("display", "inline-block").trigger("change");
	
	// Generate risk table
	risks.generate();
	
	CHANGES++;
	
};

//*****************************************************************************
//* 
//*****************************************************************************
var setupReportDialog = function ()
{
	$("#reportDialog").dialog({
		title : "Risk Report for Inclusion in ASR" ,
		autoOpen: false ,
		height: 800 ,
		width: 1000 ,
		modal: true ,
		buttons: 
		{
			"Finished" : function ()
			{
				$(this).dialog("close");
			} 
		}		
	});
};

//*****************************************************************************
//* Template Save Dialog Functions
//*****************************************************************************

// Perform a save operation
var saveTemplate = function ( templateId = { scope : null , name : null } )
{
	var { scope , name } = templateId;
	
	// Map a scope to a set component attributes
	var map = 
	{ 
		threat : { threats : threats.view } , 
		vulnerability : { vulnerabilities : vulnerabilities.view } , 
		control : { controls: null }
	};
	
	// Set up components for scrape call
	var components = Object.assign(
		{ assets: null , threats: null, vulnerabilities: null, risks: null , controls: null } , 
		map[scope]
	);
	
	// See if template exists first
	var exists = MODELS.templateExists(scope , name);
	
	// Use it if so, otherwise create a new one
	var template = exists ? 
		MODELS.getTemplate(scope, name) : 
		new StormIapModelTemplate({ name: name, template: true , templateScope: scope });

	// Update model with CRUD & tables
	template.scrape(components);	
	
	// KLUDGE to set "template" field to "true"
	var plural = Object.keys(map[scope])[0];
	
	for (var row of template[plural])
	{
		row[1] = true;
	}

	// Save it
	MODELS.save({ updates: template , autosave : false  , postProcessor : function ( newTemplate ) 
	{
		if (!exists)
		{
			this.addTemplate(scope , name , newTemplate);
		}
	}});
};

// Set up dialog
var setupSaveTemplateDialog = function ()
{
	$("#saveTemplateDialog").dialog({
		title : "Save a Template" ,
		autoOpen: false ,
		height: "auto" ,
		width: "50%" ,
		modal: true ,
		buttons:
		[
			{
				text: "Save" ,
				width: "12em" ,
				click: function ()
				{
					var scope = $("#saveTemplateComponent").val();
					var name = $("#saveTemplateName").val();
					
					if (!scope || !name)
					{
						alert("You must specify both a template scope and template name to save");
					}
					else
					{
						var exists = MODELS.templateExists(scope, name);
						
						if (!exists || confirm(`Template '${scope} ${name}' already exists--overwrite?`))
						{
							saveTemplate({ scope: scope , name: name });
					
							$(this).dialog("close");
						}
					}
				}
			},
			{
				text: "Cancel" ,
				width: "13em" ,
				click: function ()
				{
					$(this).dialog("close");
				}
			}
		]
	});
};

// Initiate application data load
var openSaveTemplateDialog = function ( scope = null )
{
	$("#saveTemplateComponent").val(scope);
	$("#saveTemplateName").val(null);
	
	MODELS.autocomplete("#saveTemplateName", null, scope);
		
	$("#saveTemplateDialog").dialog("open");
};

//*****************************************************************************
//* Template Dialog Functions
//*****************************************************************************

// Set up dialog
var setupTemplateDialog = function ()
{
	templates = $("#templates").DataTable({
		data: [] ,
		// scroller: true , 
		// scrollY: 400 ,
		// srollCollapse: true ,
		columns: 
		[
			{ title: "Template Name" , width: "20em" } ,
			{ title: "Scope" , width: "10em" } ,
			{ title: "Description" , width: "20em" }
		]
	});
	
	$("#templateDialog").dialog({
		title : "Template Manager" ,
		autoOpen: false ,
		height: "auto" ,
		width: "80%" ,
		modal: true ,
		buttons:
		[
			{
				text: "Load Selected" ,
				width: "12em" ,
				click: function ()
				{
					var candidates = $("#templates tr.selected");
					
					candidates.each(function ()
					{
						var cache = $(this);
						var [ name, scope ] = templates.row(cache).data();
						var template = MODELS.getTemplate(scope, name).convert(); 
						
						loadInterface(template, false);
					});
					
					$(this).dialog("close");
				}
			},
			{
				text: "Quit" ,
				width: "13em" ,
				click: function ()
				{
					$(this).dialog("close");
				}
			}
		]
	});
};

// Initiate application data load
var openTemplateDialog = function ( scopes = { "*" : true } )
{
	templates.clear();
	
	$("#list").text(null);
	
	var data = MODELS.getTemplates();
	
	for (var [scope, map] of Object.entries(data))
	{
		if ((scope in scopes) || ("*" in scopes)) 
		{
			for (var [name, details] of Object.entries(map))
			{
				var description = "description" in details ? details.description : "&mdash;";
				var row = [ name, scope, description ];
				
				templates.row.add(row);
			}
		}
	}
	
	templates.draw();
	
	$("#templateDialog").dialog("open");
		
	$("#templates tbody").off("click").on("click", "tr", function ( thrown ) // jshint unused:false
	{
		var cache = $(this);
		var name = templates.row(cache).data()[0];
		
		if (cache.hasClass("selected"))
		{
			cache.removeClass("selected");
			
			var selectText = $("#list").text();
			var selected = selectText ? selectText.split(", ") : [];
			
			selected = removeByName(selected, name);
			
			$("#list").text(selected.join(", "));
		}
		else
		{
			cache.addClass("selected");
			
			var selectText = $("#list").text();
			var selected = selectText ? selectText.split(", ") : [];
			
			selected.push(name);
			
			$("#list").text(selected.join(", "));
		}	
	});
};

//*****************************************************************************
//* Selection Dialog Functions
//*****************************************************************************

// Set up dialog
var setupSelectionDialog = function ()
{
	$("#asrDialog").dialog({
		title : "ASR Risk Management Selection" ,
		autoOpen: false ,
		height: "auto" ,
		width: "90%" ,
		modal: true ,
		buttons:
		[
			{
				text: "Load Selected" ,
				width: "12em" ,
				click: function ()
				{
					var candidate = $("#asrSelections tr.selected").first();
					
					var asr = applications.row(candidate).data();
					var asrName = asr[0];
					var model = MODELS.exists(asrName) ? 
						MODELS.getModel(asrName) : 
						new StormIapModel({ name: asrName , assets: [], risks: [], threats: [], pairings: [], vulnerabilities: [] });
					
					$("#modelName").text(asrName);
					$("#save, #reset, #assetTab, #threatTab, #vulnerabilityTab").prop("disabled", false);
					
					loadInterface(model);
					
					enableUi(true);
					
					$(this).dialog("close");
				}
			},
			{
				text: "Quit" ,
				width: "13em" ,
				click: function ()
				{
					$(this).dialog("close");
				}
			}
		]
	});
};

// Ajax function to load application data
var applicationLoader = function ( callback )
{
	var request = { action : "applications" };
	var postProcessor = (callback instanceof Function) ? callback : function ()
	{
		alert("applicationLoader requires a post-processor callback");
	};
	
	$.ajax({
		method: "post" ,
		url: "asrRisk.cgi" ,
		data: request ,
		timeout: 80000 ,
		success: function ( results ) 
		{
			// If the user is not authorized, reset everything	
			if (results.failed)
			{
				alert("applicationLoader failure: " + results.exception);
			}
			else
			{
				// If complain when we have no data (dater)
				if (!("nodes" in results) || (results.nodes === null))
				{
					alert("applicationLoader failure: no results from asrRisk.cgi");
				}
				else
				{
					APPLICATIONS = [];
					
					// Load applications
					for (var [logicName, logicRow] of Object.entries(results.nodes))
					{
						APPLICATIONS.push(logicRow);
					}
				
					if (("models" in results) && (results.models !== null))
					{
						for (var [logicName, model] of Object.entries(results.models))
						{
							MODELS.addModel(logicName, model);
						}
					}
				}			
			}
			
			postProcessor.call(this, APPLICATIONS, MODELS);
		},
		error : function ( request , status , exception )
		{
			alert("applicationLoader failure status: " + exception.toString());	
		}
	});	
};

// Initiate application data load
var loadSelector = function ()
{
	applicationLoader(displaySelectorDialog);
	
	// Post processing callback
	function displaySelectorDialog ( applicationList , modelMap )  // jshint unused:false
	{
		if (applications) 
		{
			applications.destroy();
		}
			
		applications = $("#asrSelections").DataTable({
			data: applicationList ,
			// scroller: true , 
			// scrollY: 600 ,
			// srollCollapse: true ,
			columns: 
			[
				{ title: "Application Name" , width: "20em" } ,
				{ title: "Assessed?" , width: "5em" } ,
				{ title: "IT Owner" , width: "10em" } ,
				{ title: "ENTSEC Resource", width: "10em" } ,
				{ title: "Description" , width: "20em" }
			]
		});
		
		$("#asrDialog").dialog("open");
		
		$("#asrSelections tbody").off("click");
		$("#asrSelections tbody").on("click", "tr", function ( thrown ) 
		{
			var cache = $(this);
			
			if (cache.hasClass("selected"))
			{
				cache.removeClass("selected");
				$("#selected").text(null);
			}
			else
			{
				applications.$("tr.selected").removeClass("selected");
				cache.addClass("selected");
				
				var logicName = applications.row(cache).data()[0];
				
				$("#selected").text(logicName);
			}	
		});
	}
};

//*****************************************************************************
//* 
//*****************************************************************************
var clearInput = function ()
{
	$("input[type=text]").val(null);
	
	$(".input").text(null);
};

//*****************************************************************************
//* 
//*****************************************************************************
function pageReset ()
{
	if (confirm("This will reset the model, and if you save the model will reset its permanent state!"))
	{
		asset.reset();
		threatInterface.reset();
		vulnerabilityInterface.reset();
		controlInterface.reset();

		risks.view.dataTable.clear().draw();
		
		/** VTP SHELVED - BUILD 873 
		$("#vtTable").empty();
		**/
		
		//$(".completed").css("display", "none");
		/** VTP SHELVED - BUILD 873
		$("#threatAggregated").prop("checked", false).trigger("change");
		**/
		$("#risks").prop("disabled", true);
		$("#reporter").prop("disabled", true);
		
		var name = $("#modelName").text();
		
		if (name && MODELS.exists(name))
		{
			MODELS.getModel(name).reset();
		}

		enableUi(false);
				
		setRiskModel("tar");
		
		clearInput();
		
		CHANGES = 0;
	}
}

//*****************************************************************************
//* Utility functions
//*****************************************************************************
function removeByName(list, name)
{
	var proceed =
		((list !== undefined) && (list !== null) && (list instanceof Array)) &&
		((name !== undefined) && (name !== null) && (typeof name === "string"));
		
	var answer = null;
	
	if (proceed)
	{
		var position = list.findIndex(element => element === name);
		
		if (position !== -1)
		{
			list.splice(position, 1);
		}
		
		answer = list;
	}
	
	return answer;
}

//*****************************************************************************
//* 
//*****************************************************************************
function pageLocal ()
{ 
	// Load information from database
	MODELS.reset({ actor : modelLoader, identityCheck : IDENTITY.check , callback : modelsLoaded }).load();
	
	// Set up report dialog
	setupReportDialog();
	
	// Set up template dialog
	setupTemplateDialog();
	
	// Set up template save dialog
	setupSaveTemplateDialog();
	
	// Set up model selection dialog
	setupSelectionDialog();
	
	$("#tmSave").button();
	
	$(".completed").css("display", "none");
	
	clearInput();
	
	// Set up navigation tabs		
	$("#steps").tabs(/** VTP SHELVED - BUILD 873 { beforeActivate: generatePairing } **/);
	
	// Create process objects	
	asset = new AsrValuation("#assetProcessTable", "#ac", "").materialize().update();
	threat = new StormHAM533("#threatProcessTable", "").materialize().update();
	vulnerability = new StormCRVE3("#vulnerabilityProcessTable", "").materialize().update();
	control = new StormSCEP("#controlProcessTable", "", choicesFromVulnerabilities).materialize().update();
	
	// Set up tables
	setupThreatTable();
	setupVulnerabilityTable();	
	setupControlTable();
	setupRiskTable();
	
	// Create interaction objections
	threatInterface = new AsrThreatInterface();
	vulnerabilityInterface = new AsrVulnerabilityInterface();
	controlInterface = new AsrControlInterface();

	// These are "ready" flags to tell user which component of risk calculation are completed
	$(".completed").on("change", enableRisks);
	
	// This button generates risks on demand (should be done automatically in most cases)
	$("#risks").prop("disabled", true);
	$("#risks").button().on("click", risks.generate);

	// This button generates a report for inclusion in the ASR
	$("#reporter").prop("disabled", true);
	$("#reporter").button().on("click", generateReport);
	
	// These buttons have to do with model management
	$("#select").button().on("click", loadSelector);
	$("#save").button().on("click", saveModel);
	$("#reset").button().on("click", pageReset);
	$("#flush").button().on("click", deleteModel);

	// Button actions
	$("#setValue").on("click", setAssetValue);
	$("#threatAggregated").on("click", setRiskModel);
	$("#addThreat").on("click", addThreat);	
	$("#addVulnerability").on("click", addVulnerability);
	$("#addControl").on("click", addControl);
	$("#vLoad").button().on("click", function () { openTemplateDialog({"vulnerability" : true}); });
	$("#tLoad").button().on("click", function () { openTemplateDialog({"threat" : true }); });
	$("#cLoad").button().on("click", function () { openTemplateDialog({"control" : true }); });
	$("#vSave").button().on("click", function () { openSaveTemplateDialog("vulnerability"); });
	$("#tSave").button().on("click", function () { openSaveTemplateDialog("threat"); });
	$("#cSave").button().on("click", function () { openSaveTemplateDialog("control"); });
	$(".fubar tbody").on("dblclick", "tr", loadProcess);
	
	$("#asrSelections tbody").on("click", "tr", function () 
	{
		var cache = $(this);
		
		if (cache.hasClass("selected"))
		{
			cache.removeClass("selected");
			$("#selected").text(null);
		}
		else
		{
			applications.$("tr.selected").removeClass("selected");
			cache.addClass("selected");
			
			var logicName = applications.row(cache).data()[0];
			//var model = MODELS.getModel(logicName);
			//var modelName = model.name;
			
			$("#selected").text(logicName);
		}	
	});
	
	$("#tmList").selectable();
	
	// Disable UI (yes, with a function called enableUi)
	enableUi();

	// Set default risk model
	setRiskModel("tar");
	
	interactions = new Interactions(null, { rowClickContext: "table.fubar tbody" });
	
	interactions.loadKeys(
	[
		{code: 88, needCtrl: true, action: deleteRow, label: "Delete Row", legend: "X"}, 
		{code: 88, needMeta: true, action: deleteRow, label: "Delete Row", legend: "X"} ,
	]);
	
	TIMER = setInterval(function () 
	{
		if ($("#modelName").text() && CHANGES)
		{
			var stamp = new Date().toISOString();
			
			console.log("Autosaving with " + CHANGES + " changes on " + stamp + " ...");
		
			saveModel(true);
		
			$("#autosave").text("Autosaved on " + stamp);
			
			CHANGES = 0;
		}
	}, 5*60*1000);

}