// Copyright 2014-2015, Yahoo! Inc.
// Copyrights licensed under the Mit License. See the accompanying LICENSE file for terms.

var _ = require('underscore'),
	PNG = require('pngjs').PNG,
	pixel = require('./lib/pixel'),
	modify = require('./lib/modify'),
	conversion = require('./lib/conversion'),
	filters = require('./lib/filters'),
	streamBuffers = require("stream-buffers"),
	MemoryStream = require('./lib/memoryStream');

var Decoder = require('./lib/png/decoder');
var Encoder = require('./lib/png/encoder');

/**
 * PNGjs-image class
 *
 * @class PNGImage
 * @submodule Core
 * @param {PNG} image png-js object
 * @constructor
 */
function PNGImage (image) {
	image.on('error', function (err) {
		PNGImage.log(err.message);
	});
	this._image = image;
}

/**
 * Project version
 *
 * @property version
 * @static
 * @type {string}
 */
PNGImage.version = require('./package.json').version;


/**
 * Filter dictionary
 *
 * @property filters
 * @static
 * @type {object}
 */
PNGImage.filters = {};

/**
 * Sets a filter to the filter list
 *
 * @method setFilter
 * @param {string} key
 * @param {function} [fn]
 */
PNGImage.setFilter = function (key, fn) {
	if (fn) {
		this.filters[key] = fn;
	} else {
		delete this.filters[key];
	}
};


/**
 * Creates an image by dimensions
 *
 * @static
 * @method createImage
 * @param {int} width
 * @param {int} height
 * @return {PNGImage}
 */
PNGImage.createImage = function (width, height) {
	var image = new PNG({
		width: width,
		height: height
	});
	return new PNGImage(image);
};


/**
 * Copies an already existing image
 *
 * @static
 * @method copyImage
 * @param {PNGImage} image
 * @return {PNGImage}
 */
PNGImage.copyImage = function (image) {
	var newImage = this.createImage(image.getWidth(), image.getHeight());
	image.getImage().bitblt(newImage.getImage(), 0, 0, image.getWidth(), image.getHeight(), 0, 0);
	return newImage;
};

/**
 * Loads an image from a blob
 *
 * @static
 * @method loadImage
 * @param {Buffer} blob
 * @param {function} fn
 * @return {PNGImage}
 */
PNGImage.loadImage = function (blob, fn) {
	var image = new PNG(),
		resultImage = new PNGImage(image);

	fn = fn || function () {};

	image.once('error', function (err) {
		fn(err, resultImage);
	});
	image.parse(blob, function () {
		image.removeListener('error', fn);
		fn(undefined, resultImage);
	});

	return resultImage;
};


/**
 * Loads an image synchronously from a blob
 *
 * @static
 * @method loadImageSync
 * @param {Buffer} blob
 * @return {PNGImage}
 */
PNGImage.loadImageSync = function (blob) {
	var decoder,
		data,
		headerChunk,
		width, height;

	decoder = new Decoder();
	data = decoder.decode(blob, { strict: false });

	headerChunk = decoder.getHeaderChunk();
	width = headerChunk.getWidth();
	height = headerChunk.getHeight();

	var image = new PNG({
		width: width,
		height: height
	});
	data.copy(image.data, 0, 0, data.length);
	return new PNGImage(image);
};

/**
 * Log method that can be overwritten to modify the logging behavior
 *
 * @static
 * @method log
 * @param {string} text
 */
PNGImage.log = function (text) {
	// Nothing yet; Overwrite this when needed
};

PNGImage.prototype = {

	/**
	 * Gets the original png-js object
	 *
	 * @method getImage
	 * @return {PNG}
	 */
	getImage: function () {
		return this._image;
	},

	/**
	 * Gets the image as a blob
	 *
	 * @method getBlob
	 * @return {Buffer}
	 */
	getBlob: function () {
		return this._image.data;
	},


	/**
	 * Gets the width of the image
	 *
	 * @method getWidth
	 * @return {int}
	 */
	getWidth: function () {
		return this._image.width;
	},

	/**
	 * Gets the height of the image
	 *
	 * @method getHeight
	 * @return {int}
	 */
	getHeight: function () {
		return this._image.height;
	},


	/**
	 * Clips the current image by modifying it in-place
	 *
	 * @method clip
	 * @param {int} x Starting x-coordinate
	 * @param {int} y Starting y-coordinate
	 * @param {int} width Width of area relative to starting coordinate
	 * @param {int} height Height of area relative to starting coordinate
	 */
	clip: function (x, y, width, height) {

		var image;

		width = Math.min(width, this.getWidth() - x);
		height = Math.min(height, this.getHeight() - y);

		if ((width < 0) || (height < 0)) {
			throw new Error('Width and height cannot be negative.');
		}

		image = new PNG({
			width: width, height: height
		});

		this._image.bitblt(image, x, y, width, height, 0, 0);
		this._image = image;
	},

	/**
	 * Fills an area with the specified color
	 *
	 * @method fillRect
	 * @param {int} x Starting x-coordinate
	 * @param {int} y Starting y-coordinate
	 * @param {int} width Width of area relative to starting coordinate
	 * @param {int} height Height of area relative to starting coordinate
	 * @param {object} color
	 * @param {int} [color.red] Red channel of color to set
	 * @param {int} [color.green] Green channel of color to set
	 * @param {int} [color.blue] Blue channel of color to set
	 * @param {int} [color.alpha] Alpha channel for color to set
	 * @param {float} [color.opacity] Opacity of color
	 */
	fillRect: function (x, y, width, height, color) {

		var i,
			iLen = x + width,
			j,
			jLen = y + height,
			index;

		for (i = x; i < iLen; i++) {
			for (j = y; j < jLen; j++) {
				index = this.getIndex(i, j);
				this.setAtIndex(index, color);
			}
		}
	},


	/**
	 * Draws a box around an area with the specified color
	 *
	 * @method strokeRect
	 * @param {int} x Starting x-coordinate
	 * @param {int} y Starting y-coordinate
	 * @param {int} width Width of area relative to starting coordinate
	 * @param {int} height Height of area relative to starting coordinate
	 * @param {int} lineWidth Width of the stroke line in pixels
	 * @param {object} color
	 * @param {int} [color.red] Red channel of color to set
	 * @param {int} [color.green] Green channel of color to set
	 * @param {int} [color.blue] Blue channel of color to set
	 * @param {int} [color.alpha] Alpha channel for color to set
	 * @param {float} [color.opacity] Opacity of color
	 */
	strokeRect: function (x, y, width, height, lineWidth, color) {

		var i,
			iLen = x + width,
			j,
			jLen = y + height,
			index;

		for (i = x; i < iLen; i++) {
			for (j = y; j < jLen; j++) {
				if ((i > lineWidth && (i < i - lineWidth)) || (j > lineWidth && (j < j - lineWidth))){
					continue;
				}

				index = this.getIndex(i, j);
				this.setAtIndex(index, color);
			}
		}
	},


	/**
	 * Applies a list of filters to the image
	 *
	 * @method applyFilters
	 * @param {string|object|object[]} filters Names of filters in sequence `{key:<string>, options:<object>}`
	 * @param {boolean} [returnResult=false]
	 * @return {PNGImage}
	 */
	applyFilters: function (filters, returnResult) {

		var image,
			newFilters;

		// Convert to array
		if (_.isString(filters)) {
			filters = [filters];
		} else if (!_.isArray(filters) && _.isObject(filters)) {
			filters = [filters];
		}

		// Format array as needed by the function
		newFilters = [];
		(filters || []).forEach(function (filter) {

			if (_.isString(filter)) {
				newFilters.push({key: filter, options: {}});

			} else if (_.isObject(filter)) {
				newFilters.push(filter);
			}
		});
		filters = newFilters;

		// Process filters
		image = this;
		(filters || []).forEach(function (filter) {

			var currentFilter = PNGImage.filters[filter.key];

			if (!currentFilter) {
				throw new Error('Unknown filter ' + filter.key);
			}

			filter.options = filter.options || {};
			filter.options.needsCopy = !!returnResult;

			image = currentFilter(this, filter.options);

		}.bind(this));

		// Overwrite current image, or just returning it
		if (!returnResult) {
			this._image = image.getImage();
		}

		return image;
	},


	/**
	 * Gets index of a specific coordinate
	 *
	 * @method getIndex
	 * @param {int} x X-coordinate of pixel
	 * @param {int} y Y-coordinate of pixel
	 * @return {int} Index of pixel
	 */
	getIndex: function (x, y) {
		return (this.getWidth() * y) + x;
	},


	toBlobSync: function (options) {
		var encoder = new Encoder();
		return encoder.encode(this.getBlob(), this.getWidth(), this.getHeight(), options);
	},

	/**
	 * Writes the image to a buffer
	 *
	 * @method toBlob
	 * @param {function} fn Callback
	 */
	toBlob: function (fn) {

		var writeBuffer = new streamBuffers.WritableStreamBuffer({
			initialSize: (100 * 1024), incrementAmount: (10 * 1024)
		});

		fn = fn || function () {};

		this._image.pack().pipe(writeBuffer).once('close', function () {
			this._image.removeListener('error', fn);
			fn(undefined, writeBuffer.getContents());
		}.bind(this)).once('error', function (err) {
			this._image.removeListener('close', fn);
			fn(err);
		}.bind(this));
	}
};
PNGImage.prototype.constructor = PNGImage;


// Add standard methods to the prototype
_.extend(PNGImage.prototype, pixel);
_.extend(PNGImage.prototype, modify);
_.extend(PNGImage.prototype, conversion);


// Adds all standard filters
_.keys(filters).forEach(function (key) {
	PNGImage.setFilter(key, filters[key]);
});

/**
 * Instruments the node environment so that PNG files can be loaded through require calls
 *
 * @static
 * @method instrument
 */
PNGImage.instrument = function () {
	require.extensions['.png'] = function(module, filename) {
		var image = PNGImage.readImageSync(filename);
		module.exports = image;
	};
};

PNGImage.Decoder = Decoder;
PNGImage.Encoder = Encoder;

module.exports = PNGImage;
