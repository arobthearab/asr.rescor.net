//jshint esnext:true
"use strict";
//*****************************************************************************
//* StackMap
//*	Access things as as queue, stack, or map
//*****************************************************************************

class StackMap
{
	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	constructor ( element , childClassName , childKey , childElementType )
	{
		this.element = element ? element : null;
		this.childClassName = childClassName ? childClassName : Object;
		this.childElementType = childElementType ? childElementType : null;
		this.childKey = childKey;
		this.map = {};
		this.stack = [];
		this.pointer = -1;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------	
	get length ()
	{
		return this.stack.length;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------	
	flush ()
	{
		this.map = {};
		this.stack = [];
		this.pointer = -1;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------	
	domChildren ( filter = "*" )
	{
		var parent = this.element;
		var type = this.childElementType;
		var answer = [];
		
		if (parent && type)
		{
			answer = $(parent).children(type).filter(filter);
		}
		
		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	static searchHelper ( parameters ) 
	{
		var { items , criteria , sensitive , simple , propertiesToCompare } = parameters;
		var answers = [];
		var value;
		var comparand;
		var matched;
		var list;
		var candidate;
		var property;

		for (candidate of items)
		{
			// Set up for simple search
			if (simple)
			{
				matched = false;
				list = Object.getOwnPropertyNames(candidate);
			}

			// Set up for compound search
			else
			{
				matched = true;
				list = propertiesToCompare;
			}

			// Now evalute necessary comparisons
			for (property of list)
			{
				value = candidate[property];
				comparand = simple ? criteria : criteria[property];

				// Deep search not yet supported do to infinite recursion
				if (value instanceof Object) 
				{
					matched = false;
				}

				// Compare value against regular expression
				else if (comparand instanceof RegExp)
				{
					matched = comparand.test(value);
				}

				// Compare value against simple string
				else if (typeof value === "string") 
				{
					matched = sensitive ? 
						value === comparand :
						value.toLowerCase() === comparand.toString().toLowerCase();
				}

				// Compare value against number
				else if (typeof value === "number")
				{
					matched = (value === comparand);
				}

				// Break out if simple & any property matched, or not simple and any property failed
				if ((simple && matched) || (!simple && !matched))
				{
					break;
				}
			}

			// Save any matches
			if (matched)
			{
				answers.push(candidate);
			}
		}

		return answers;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	search ( criteria , sensitive )
	{
		var answers = [];
		var propertiesToCompare = null;
		var simple = false;

		// Compare a string to all property values
		if (typeof criteria === "string") 
		{
			simple = true;
		}

		// Compare a number to all property values
		else if (typeof criteria === "number")
		{
			simple = true;
		}

		// Apply a regular expression to all property values
		else if (criteria instanceof RegExp)
		{
			simple = true;
		}

		// Determine if a element class instance matches 1:1 with a StackMap item
		else if (criteria instanceof this.childClassName)
		{
			simple = false;
			propertiesToCompare = Object.getOwnPropertyNames(criteria);
		}

		// Match all of a set of keys and values with StackMap items
		else if (criteria instanceof Object)
		{
			simple = false;
			propertiesToCompare = Object.getOwnPropertyNames(criteria);
		}

		// This is not a valid search
		else
		{
			throw new TypeError("StackMap/search invalid criteria [" + criteria + "]");
		}

		answers = StackMap.searchHelper({
			"items" : this.stack ,
			"criteria" : criteria ,
			"sensitive" : sensitive ,
			"simple" : simple ,
			"propertiesToCompare" : propertiesToCompare 
		});

		return answers;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	_parseSlot ( value , permissive )
	{
		var exception = null;

		if (isNaN(value))
		{
			exception = new TypeError("StackMap/_parseSlot non-numeric value [" + value + "]");
		}
		else if (!Number.isInteger(value))
		{
			exception = new TypeError("StackMap/_parseSlot non-integer value [" + value + "]");
		}
		else if ((value < 0) || (value >= this.stack.length))
		{
			exception = new TypeError("StackMap/_parseSlot position out of range [" + value + "]");
		}

		if (exception && !permissive)
		{
			throw exception;
		}

		return value;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	_serialize ( value ) 
	{
		var answer;
		 
		if ((value === undefined) || (value === null))
		{
			throw new TypeError("StackMap/_serialize no value provided");
		}
		else
		{
			answer = (value instanceof Object ) ?
				JSON.stringify(value) :
				value;
		}

		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	_mapSet ( value , position )
	{
		var key = this._serialize(value);

		if (key in this.map)
		{
			throw new TypeError("StackMap/_mapSet duplicate key [" + key + "]");
		}
		else if (isNaN(position))
		{
			throw new TypeError("StackMap/_mapSet non-numeric position [" + position + "]");
		}
		else
		{
			this.map[key] = position;
		}

		return position;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	_mapGet ( value )
	{
		var key = this._serialize(value);
		var answer;

		if (key in this.map)
		{
			answer = this.map[key];
		}
		else
		{
			answer = null;
		}

		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	_listSet ( slot , candidate )
	{
		var where = this._parseSlot(slot);

		if (!(candidate instanceof this.childClassName))
		{
			throw new TypeError("StackMap/_listSet candidate is not " + this.childClassName + " [" + candidate + "]");
		}
		else
		{
			this.stack[where] = candidate;
		}

		return candidate;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	_listGet ( slot ) 
	{
		var where = this._parseSlot(slot);
		var answer = this.stack[where];

		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	has ( candidate) 
	{
		var answer = null;
		var key;
		var slot;

		if ((candidate === null) || (candidate === undefined))
		{
			throw new TypeError("StackMap/has no selector item provided");
		}
		else if ((candidate instanceof this.childClassName) && (this.childKey in candidate))
		{
			key = candidate[this.childKey];
		}
		else
		{
			key = candidate;
		}

		slot = this._mapGet(key);
		answer = this._listGet(slot);

		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	add ( candidate , callbacks = {} ) 
	{
		var key, position;
		
		if (!(candidate instanceof this.childClassName))
		{
			throw new TypeError("StackMap/add argument must be Object [" + candidate + "]");
		}
		else
		{
			if (!(this.childKey in candidate))
			{
				throw new TypeError("StackMap/add object is missing '" + this.childKey + "' [" + candidate + "]");
			}

			else
			{
				key = candidate[this.childKey];
				position = this.stack.length;
			
				if (key in this.map)
				{
					throw new TypeError("StackMap/add duplicate for key [" + key + "]");
				}
				else
				{
					if (callbacks.preprocess instanceof Function)
					{
						candidate = callbacks.preprocess.call(this, candidate, key, position);
					}
					
					this.stack.push(candidate);
					this.map[key] = position;

					candidate.parent = this;
				}
			}
		}
		
		return { key : key , position : position };
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	grandParent ()
	{
		var parent = this.parent();
		var answer = parent.parent();
		
		return answer;
	}
	
	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	parent ()
	{
		var answer = null; 
		
		if (this.hasOwnProperty("parent"))
		{
			answer = this.parent;
		}
		else
		{
			throw new ReferenceError("StackMap/parent no parent property for" , this);
		}
		
		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	reset ()
	{
		this.pointer = -1;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	next ()
	{
		var next = this.pointer + 1;
		var answer;

		if (next >= this.stack.length)
		{
			answer = false;
		}
		else
		{
			answer = true;
		}

		this.pointer = next;

		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	current () 
	{
		var answer;
		
		if (this.pointer >= this.stack.length)
		{
			answer = null;
		}
		else
		{
			answer = this.stack[this.pointer];
		}

		return answer;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	*stackGenerator ( objectify = true ) // jshint ignore:line
	{
		for (var stackItem of this.stack)
		{
			var answer = objectify ? Object.assign(new this.childClassName, stackItem) : stackItem;	// jshint ignore:line
			yield answer; // jshint ignore:line
		}
	}
	
	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	*mapGenerator () // jshint ignore:line
	{
		for (var key in this.map)
		{
			var index = this.map[key];
			
			yield Object.assign(new this.childClassName, this.stack[index]); // jshint ignore:line
		}
	}
	
	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	set ( candidate , location )
	{
		var index;
		
		// The candidate has a valid index value
		if ((this.childKey in candidate) && !isNaN(candidate[this.childKey]))
		{
			index = candidate[this.childKey];
		}
		
		// Hoepfully we have an override location
		else
		{
			if ((location === null) || isNaN(location))
			{
				throw new TypeError("StackMap/set no value for " + this.childKey + " and no override location");
			}
			else
			{
				index = location;
				candidate[this.childKey] = location;
			}
		}

		candidate.parent = this;		
		this.stack[index] = candidate;

		return candidate;
	}

	//---------------------------------------------------------------------
	// 
	//---------------------------------------------------------------------
	get ( selector ) 
	{
		var index = null;
		var key = null;

		// Numeric selector
		if (Number.isInteger(selector))
		{
			index = parseInt(selector);
		}

		// String selector 
		else if (typeof selector === "string") 
		{
			index = (selector in this.map) ? this.map[selector] : null; 
		}

		// Object selector
		else if ((selector instanceof Object) && (this.childKey in selector))
		{
			key = selector[this.childKey];
			index = (key in this.map) ? this.map[key] : null;
		}

		var answer = (index !== null) && (this.stack[index] !== undefined) ?
			this.stack[index] :
			null;
			
		return answer;
	}
}