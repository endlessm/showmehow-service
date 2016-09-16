/* src/validation.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * The core logic for validating coding game service timeline files.
 */

const _TYPES = {
    array: x => Array.isArray(x),
    string: x => typeof(x) === 'string',
    boolean: x => typeof(x) === 'boolean',
    number: x => typeof(x) === 'number',
    object: x => typeof(x) === 'object'
};

/**
 * prettyFormat
 *
 * Pretty-format JavaScript object 'obj'.
 */
function prettyFormat(obj) {
    return ' (' + JSON.stringify(obj, null, 2) + ')';
}

/**
 * validateDescriptors
 *
 * Ensure that the specified descriptors given are valid, so that
 * we don't get odd stringly typed errors later. Returns any
 * valid descriptors as well as a list of errors.
 */
function validateDescriptors(descriptors) {  // eslint-disable-line no-unused-vars
    let errors = [];

    /**
     * validateObjectAgainstProps
     *
     * Ensure that the passed in object obj matches the
     * props description specified. Inspired by
     * React's PropTypes.
     *
     * If mandatory is true, then every property props must
     * be present in the obj's fields.
     */
    let validateObjectAgainstProps = function(chain, obj, props, mandatory) {
        if (typeof props === 'function') {
            return props(chain, obj, mandatory);
        }

        return props.map(desc => {
            let chainAtProp = chain.concat(desc.name);
            let isDefined = obj[desc.name] !== undefined;

            /* No 'validate' or 'type' member - bad schema. Throw
             * warning appropriately */
            if (!desc.validate && !desc.type) {
                throw new Error('desc (' + prettyFormat(desc) + ') ' + 'for '
                                + chain + ' must have either a validate or ' +
                                'type member');
            }

            /* Only validate this prop's type if a 'type' specifier
             * was given for it - otherwise use the 'validate' function
             * to validate it. */
            if (desc.type && !_TYPES[desc.type](obj[desc.name])) {
                /* If this prop is not mandatory, then only report
                 * an error if it was defined and not defined to
                 * what we expected it to be. */
                if (mandatory || isDefined) {
                    errors.push('Expected ' +
                                chainAtProp.join('.') +
                                ' to be a ' + desc.type +
                                ' but it was a ' + typeof obj[desc.name] +
                                ' in examining' + prettyFormat(obj[desc.name]) +
                                ' in' + prettyFormat(obj));
                    return false;
                }
            }

            if (desc.validate) {
                /* Can't validate undefined properties */
                if (!isDefined) {
                    /* If we expected this property, throw an error. */
                    if (mandatory) {
                        throw new Error('Cannot validate undefined value found ' +
                                        ' at key ' + desc.name + ' in ' +
                                        'in processing ' + chain + ' ' +
                                        prettyFormat(obj));
                    }
                } else {
                    /* Only recurse if we're defined */
                    if (typeof desc.validate === 'object') {
                        let failedCount = 0;

                        /* "mandatory" and "optional" here refer to props on the
                         * child object that we will be recursing into. If props
                         * are mandatory, then all props must be present, otherwise
                         * validation will fail. If they are optional, then only
                         * those that are present will be validated (though if
                         * they are incorrect, validation still fails). This is
                         * represented in the boolean parameter passed to
                         * validateObjectAgainstProps. */
                        if (desc.validate.mandatory) {
                            if (!validateObjectAgainstProps(chainAtProp,
                                                            obj[desc.name],
                                                            desc.validate.mandatory,
                                                            true)) {
                                failedCount++;
                            }
                        }

                        if (desc.validate.optional) {
                            if (!validateObjectAgainstProps(chainAtProp,
                                                            obj[desc.name],
                                                            desc.validate.optional,
                                                            false)) {
                                failedCount++;
                            }
                        }

                        if (failedCount > 0) {
                            return false;
                        }
                    } else {
                        throw new Error('props.validate must be ' +
                                        'either an object ' +
                                        'in processing ' + chain);
                    }
                }

            }

            /* Passed all validation, return true */
            return true;
        }).every(v => v);
    };

    let validateObjectValues = function(props) {
        return function(chain, obj, mandatory) {
            return Object.keys(obj).every(function(key) {
                return validateObjectAgainstProps(chain, obj[key], props, mandatory);
            });
        };
    };

    let validateMappers = function(chain, obj, mandatory) {
        /* Mappers can either be strings or objects with a name
         * and value object. */
        return obj.every(function(mapper) {
            if (typeof mapper === 'string') {
                return true;
            } else if (typeof mapper === 'object') {
                return validateObjectAgainstProps(chain,
                                                  mapper,
                                                  validateMapperObject,
                                                  mandatory);
            }

            return false;
        });
    };

    let validateInputObject = [
        {
            name: 'type',
            type: 'string'
        }
    ];

    let validateInputObjectOptional = [
        {
            name: 'settings',
            type: 'object'
        }
    ];

    let validateInput = function(props) {
        return function(chain, obj, mandatory) {
            /* Input can be either a string or an object with a name
             * and value object. */
            if (typeof obj === 'string') {
                return true;
            } else if (typeof obj === 'object') {
                return validateObjectAgainstProps(chain,
                                                  obj,
                                                  props,
                                                  mandatory);
            }

            return false;
        };
    };


    let validateEachInArray = function(props) {
        return function(chain, obj, mandatory) {
            return obj.every(function(sub) {
                return validateObjectAgainstProps(chain, sub, props, mandatory);
            });
        };
    };

    let validateMapperObject = [
        {
            name: 'type',
            type: 'string'
        }
    ];

    let validateEffectEntry = [
        {
            name: 'reply',
            type: 'string'
        }
    ];

    let validateSideEffect = [
        {
            name: 'type',
            type: 'string'
        }
    ];

    let validateOptionalEffectEntry = [
        {
            name: 'side_effects',
            type: 'object',
            validate: {
                mandatory: validateEachInArray(validateSideEffect)
            }
        },
        {
            name: 'move_to',
            type: 'string'
        },
        {
            name: 'completes_lesson',
            type: 'boolean'
        }
    ];

    let requiredPracticeProps = [
        {
            name: 'task',
            type: 'string'
        },
        {
            name: 'input',
            validate: {
                mandatory: validateInput(validateInputObject),
                optional: validateInput(validateInputObjectOptional)
            }
        },
        {
            name: 'mapper',
            type: 'array',
            validate: {
                mandatory: validateMappers
            }
        },
        {
            name: 'effects',
            type: 'object',
            validate: {
                mandatory: validateObjectValues(validateEffectEntry),
                optional: validateObjectValues(validateOptionalEffectEntry)
            }
        }
    ];

    let requiredLessonProps = [
        {
            name: 'name',
            type: 'string'
        },
        {
            name: 'desc',
            type: 'string'
        },
        {
            name: 'available_to',
            type: 'array'
        },
        {
            name: 'practice',
            type: 'object',
            validate: {
                mandatory: validateObjectValues(requiredPracticeProps)
            }
        }
    ];

    /* A descriptor fails the filter check here
     * if it is invalid and is removed. */
    let valid = descriptors.filter(desc => {
        return validateObjectAgainstProps(['lesson'],
                                          desc,
                                          requiredLessonProps,
                                          true);
    });

    return [valid, errors];
}
