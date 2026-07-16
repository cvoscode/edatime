//! Portable expression-derived column support for cleaning plans.
//!
//! The grammar is deliberately small and mirrors the legacy Transform dialog:
//! numeric literals, unquoted column names, binary `+ - * / %`, and a fixed
//! set of unary numeric functions. Keeping the parse tree here lets execution
//! and generated code share one contract instead of treating a browser string
//! as an opaque backend implementation detail.

use edatime_core::error::AppError;
use polars::prelude::{DataType, Expr, Field, Float64Chunked, IntoColumn, Schema, col, lit};

const ALLOWED_FUNCTIONS: &[&str] = &[
    "abs", "log", "log2", "log10", "sqrt", "exp", "sin", "cos", "tan", "ceil", "floor", "round",
];

#[derive(Debug, Clone, PartialEq)]
pub enum DerivedExpression {
    Column(String),
    Literal(f64),
    Binary {
        operator: char,
        left: Box<Self>,
        right: Box<Self>,
    },
    Function {
        name: String,
        input: Box<Self>,
    },
}

pub fn parse_derived_expression(raw: &str) -> Result<DerivedExpression, AppError> {
    let expression = raw.trim();
    if expression.is_empty() {
        return Err(AppError::bad_request("Derived expression is empty"));
    }
    if expression.len() > 500 {
        return Err(AppError::bad_request(
            "Derived expression is too long (max 500 chars)",
        ));
    }
    parse_expression(expression)
}

pub fn validate_derived_expression_columns(
    expression: &DerivedExpression,
    schema: &Schema,
) -> Result<(), AppError> {
    for column in expression.columns() {
        if schema.get(column.as_str()).is_none() {
            return Err(AppError::bad_request(format!(
                "Derived expression references unknown column '{column}'"
            )));
        }
    }
    Ok(())
}

impl DerivedExpression {
    pub fn columns(&self) -> Vec<String> {
        let mut columns = Vec::new();
        self.collect_columns(&mut columns);
        columns.sort();
        columns.dedup();
        columns
    }

    pub fn to_polars_expr(&self) -> Expr {
        match self {
            Self::Column(column) => col(column),
            Self::Literal(value) => lit(*value),
            Self::Binary {
                operator,
                left,
                right,
            } => match operator {
                '+' => left.to_polars_expr() + right.to_polars_expr(),
                '-' => left.to_polars_expr() - right.to_polars_expr(),
                '*' => left.to_polars_expr() * right.to_polars_expr(),
                '/' => left.to_polars_expr() / right.to_polars_expr(),
                '%' => left.to_polars_expr() % right.to_polars_expr(),
                _ => unreachable!("parser only creates supported binary operators"),
            },
            Self::Function { name, input } => float_function(input.to_polars_expr(), name),
        }
    }

    /// Render the same portable grammar as a Python Polars expression.
    pub fn to_python_polars(&self) -> String {
        match self {
            Self::Column(column) => format!("pl.col({})", quote(column)),
            Self::Literal(value) => number(*value),
            Self::Binary {
                operator,
                left,
                right,
            } => format!(
                "({} {operator} {})",
                left.to_python_polars(),
                right.to_python_polars()
            ),
            Self::Function { name, input } => {
                let input = input.to_python_polars();
                match name.as_str() {
                    "log" => format!("({input}).cast(pl.Float64).log(base=math.e)"),
                    "log2" => format!("({input}).cast(pl.Float64).log(base=2)"),
                    "log10" => format!("({input}).cast(pl.Float64).log(base=10)"),
                    _ => format!("({input}).cast(pl.Float64).{name}()"),
                }
            }
        }
    }

    /// Render the same portable grammar as a Rust Polars expression.
    pub fn to_rust_polars(&self) -> String {
        match self {
            Self::Column(column) => format!("col({})", quote(column)),
            Self::Literal(value) => number(*value),
            Self::Binary {
                operator,
                left,
                right,
            } => format!(
                "({} {operator} {})",
                left.to_rust_polars(),
                right.to_rust_polars()
            ),
            Self::Function { name, input } => {
                let operation = match name.as_str() {
                    "abs" => "value.abs()",
                    "log" => "value.ln()",
                    "log2" => "value.log2()",
                    "log10" => "value.log10()",
                    "sqrt" => "value.sqrt()",
                    "exp" => "value.exp()",
                    "sin" => "value.sin()",
                    "cos" => "value.cos()",
                    "tan" => "value.tan()",
                    "ceil" => "value.ceil()",
                    "floor" => "value.floor()",
                    "round" => "value.round()",
                    _ => unreachable!("parser validates supported function names"),
                };
                format!(
                    "({}).cast(DataType::Float64).map(|series| {{ let values = series.f64()?; let out: Float64Chunked = values.into_iter().map(|value| value.map(|value| {operation})).collect(); Ok(out.into_column()) }}, |_, _| Ok(Field::new(\"\".into(), DataType::Float64)))",
                    input.to_rust_polars()
                )
            }
        }
    }

    fn collect_columns(&self, columns: &mut Vec<String>) {
        match self {
            Self::Column(column) => columns.push(column.clone()),
            Self::Literal(_) => {}
            Self::Binary { left, right, .. } => {
                left.collect_columns(columns);
                right.collect_columns(columns);
            }
            Self::Function { input, .. } => input.collect_columns(columns),
        }
    }
}

fn quote(value: &str) -> String {
    serde_json::to_string(value).expect("string serialization cannot fail")
}

fn number(value: f64) -> String {
    if value == 0.0 {
        "0.0".to_string()
    } else {
        value.to_string()
    }
}

fn parse_expression(expression: &str) -> Result<DerivedExpression, AppError> {
    if let Some(open) = expression.find('(')
        && expression.ends_with(')')
    {
        let name = expression[..open].trim().to_ascii_lowercase();
        if !ALLOWED_FUNCTIONS.contains(&name.as_str()) {
            return Err(AppError::bad_request(format!(
                "Unknown derived expression function '{name}'. Allowed: {}",
                ALLOWED_FUNCTIONS.join(", ")
            )));
        }
        return Ok(DerivedExpression::Function {
            name,
            input: Box::new(parse_expression(
                expression[open + 1..expression.len() - 1].trim(),
            )?),
        });
    }

    for operator in ['+', '-', '*', '/', '%'] {
        let mut depth = 0_i32;
        let chars = expression.char_indices().collect::<Vec<_>>();
        for &(index, character) in chars.iter().rev() {
            match character {
                ')' => depth += 1,
                '(' => depth -= 1,
                _ => {}
            }
            if depth != 0 || character != operator || index == 0 {
                continue;
            }
            if operator == '-' {
                let previous = expression[..index].chars().next_back();
                if previous.is_none_or(|value| "+-*/%(".contains(value)) {
                    continue;
                }
            }
            let left = expression[..index].trim();
            let right = expression[index + character.len_utf8()..].trim();
            if !left.is_empty() && !right.is_empty() {
                return Ok(DerivedExpression::Binary {
                    operator,
                    left: Box::new(parse_expression(left)?),
                    right: Box::new(parse_expression(right)?),
                });
            }
        }
    }

    if let Ok(number) = expression.parse::<f64>() {
        if number.is_finite() {
            return Ok(DerivedExpression::Literal(number));
        }
        return Err(AppError::bad_request(
            "Derived expression numeric literals must be finite",
        ));
    }
    if expression.chars().any(char::is_whitespace) {
        return Err(AppError::bad_request(format!(
            "Invalid derived expression token '{expression}'"
        )));
    }
    Ok(DerivedExpression::Column(expression.to_string()))
}

fn float_function(expression: Expr, name: &str) -> Expr {
    let name = name.to_string();
    expression.cast(DataType::Float64).map(
        move |series| {
            let values = series.f64()?;
            let out: Float64Chunked = values
                .into_iter()
                .map(|value| value.map(|value| apply_function(&name, value)))
                .collect();
            Ok(out.into_column())
        },
        |_schema: &Schema, _field: &Field| Ok(Field::new("".into(), DataType::Float64)),
    )
}

fn apply_function(name: &str, value: f64) -> f64 {
    match name {
        "abs" => value.abs(),
        "log" => value.ln(),
        "log2" => value.log2(),
        "log10" => value.log10(),
        "sqrt" => value.sqrt(),
        "exp" => value.exp(),
        "sin" => value.sin(),
        "cos" => value.cos(),
        "tan" => value.tan(),
        "ceil" => value.ceil(),
        "floor" => value.floor(),
        "round" => value.round(),
        _ => unreachable!("parser validates supported function names"),
    }
}

#[cfg(test)]
mod tests {
    use super::{DerivedExpression, parse_derived_expression};

    #[test]
    fn parses_the_legacy_transform_grammar_into_a_portable_tree() {
        let expression = parse_derived_expression("log(value + 2) / temp").expect("expression");
        assert_eq!(expression.columns(), vec!["temp", "value"]);
        assert!(matches!(
            expression,
            DerivedExpression::Binary { operator: '/', .. }
        ));
    }

    #[test]
    fn rejects_unknown_functions_and_non_finite_literals() {
        assert!(parse_derived_expression("median(value)").is_err());
        assert!(parse_derived_expression("NaN").is_err());
    }

    #[test]
    fn renders_the_same_tree_for_python_and_rust_polars() {
        let expression = parse_derived_expression("sqrt(value) + 1").expect("expression");
        assert!(expression.to_python_polars().contains("pl.col(\"value\")"));
        assert!(expression.to_rust_polars().contains("value.sqrt()"));
    }
}
