/* src/validation.js
 *
 * Copyright (c) 2016 Endless Mobile Inc.
 * All Rights Reserved.
 *
 * The core logic for validating showmehow lesson files.
 */

const _TYPES = {
    "array": x => Array.isArray(x),
    "string": x => typeof(x) === "string",
    "bool": x => typeof(x) === "boolean",
    "number": x => typeof(x) === "number",
    "object": x => typeof(x) === "object"
};

/**
 * validateDescriptors
 *
 * Ensure that the specified descriptors given are valid, so that
 * we don't get odd stringly typed errors later. Returns any
 * valid descriptors as well as a list of errors.
 */
function validateDescriptors(descriptors) {
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
    const validateObjectAgainstProps = function(chain, obj, props, mandatory) {
        return props.map(desc => {
            const chainAtProp = chain.concat(desc.name);
            const isUndefined = typeof(obj[desc.name]) !== undefined;

            if (!_TYPES[desc.type](obj[desc.name])) {
                /* If this prop is not mandatory, then only report
                 * an error if it was defined and not defined to
                 * what we expected it to be. */
                if (mandatory || !isDefined) {
                    errors.push("Expected " +
                                chainAtProp.join(".") +
                                " to be a " + desc.type + " (" +
                                JSON.stringify(obj) + ")");
                    return false;
                }
            }

            /* Only recurse if the property is not undefined */
            if (desc.validate && !isUndefined) {
                if (typeof(desc.validate) === Function) {
                    return desc.validate(chainAtProp, obj[desc]);
                } else if (typeof props.validate === Object) {
                    if (desc.validate.mandatory) {
                        return validateObjectAgainstProps(chainAtProp,
                                                          obj[desc.name],
                                                          desc.validate.mandatory,
                                                          true);
                    }

                    if (desc.validate.optional) {
                        return validateObjectAgainstProps(chainAtProp,
                                                          obj[desc.name],
                                                          desc.validate.optional,
                                                          false);
                    }
                } else {
                    throw new Error("props.validate must be " +
                                    "either a function or an object");
                }
            }

            return true;
        }).every(v => v);
    };

    const validateExpectedRegex = [
        {
            name: "value",
            type: "string"
        }
    ];

    const validateExpectedCommandValue = [
        {
            name: "command",
            type: "array"
        },
        {
            name: "output_regex",
            type: "string"
        }
    ];

    const validateExpectedCommand = [
        {
            name: "value",
            type: "object",
            validate: validateExpectedCommandValue
        }
    ];

    const validateExpected = function(chain, obj) {
        if (typeof(obj.type) != TYPES.string) {
            errors.push("Expected a string property 'type' on " +
                        chain.join(".") + "(" +
                        JSON.stringify(obj) + ")");
            return false;
        }

        if (!obj.value) {
            errors.push("Expected a property 'value' on " +
                        chain.join(".") + "(" +
                        JSON.stringify(obj) + ")");
            return false;
        }

        const expectedDispatch = {
            "regex": validateExpectedRegex,
            "command": validateExpectedCommand
        };

        /* Note that we're validating this object
         * and not obj.value. That is intentional
         * as obj.value might just be a string.
         */
        return validateObjectAgainstProps(chain,
                                          obj,
                                          expectedDispatch[obj.value]);
    };

    const requiredPracticeProps = [
        {
            name: "task",
            type: "string"
        },
        {
            name: "expected",
            type: "object",
            validate: {
                mandatory: validateExpected
            }
        },
        {
            name: "success",
            type: "string"
        },
        {
            name: "fail",
            type: "string"
        }
    ];

    const optionalPracticeProps = [
        {
            name: "success_side_effect",
            type: "object",
            validate: {
                mandatory: validateSuccessSideEffect
            }
        },
        {
            name: "environment",
            type: "object"
        },
        {
            name: "only_continue_on",
            type: "string"
        }
    ];

    const requiredLessonProps = [
        {
            name: "name",
            type: "string"
        },
        {
            name: "desc",
            type: "string"
        },
        {
            name: "available_to",
            type: "array"
        },
        {
            name: "practice",
            type: "array",
            validate: {
                mandatory: requiredPracticeProps,
                optional: optionalPracticeProps
            }
        },
        {
            name: "unlocks",
            type: "array"
        },
        {
            name: "done",
            type: "string"
        }
    ];

    const validateSuccessSideEffect = [
        {
            name: "executor",
            type: "string"
        },
        {
            name: "command",
            type: "string"
        }
    ];

    /* A descriptor fails the filter check here
     * if it is invalid and is removed. */
    const valid = descriptors.filter(desc => {
        return validateObjectAgainstProps(["lesson"],
                                          desc,
                                          requiredLessonProps,
                                          true);
    });

    return [valid, errors];
}
